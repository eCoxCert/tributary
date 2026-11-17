import { describe, expect, it } from "vitest";
import { getContributorsInfo, getKatkiText, hasCommitsBy, isAncestorOfDefault, rateLimitNote, type Deps } from "./github";
import { readKatkiState } from "./katkiCheck";
import { rowTitle } from "./visibility";

const ref = { owner: "o", name: "r" };
const SHA = "a".repeat(40);
const A = (c: string) => "0x" + c.repeat(40);
const json = (status: number, body: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: h });
function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const mk = (fetch: Deps["fetch"], now = () => 0, s: ReturnType<typeof store> | null = null): Deps => ({ fetch, storage: s, now, memo: new Map(), limit: { until: null } });

describe("row titles (no fake repos)", () => {
  it("shows a repo only when verified, and never formats a token name as owner/name", () => {
    expect(rowTitle("tidewater/quill-rpc", "QRPC", A("1"))).toBe("tidewater/quill-rpc");
    const t = rowTitle(null, "facebook/react", A("1"));
    expect(t.startsWith("facebook/react · 0x")).toBe(true);
    expect(rowTitle(null, "QRPC", A("1"))).toBe(`QRPC · ${A("1").slice(0, 6)}…${A("1").slice(-4)}`);
  });
});

describe("rate limit", () => {
  const limited = () => json(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(1800) });
  it("reads the reset time, says how long checks pause, and sends no further request", async () => {
    let calls = 0;
    const d = mk(async () => { calls++; return limited(); }, () => 600_000); // now = 10 min, reset at 30 min
    await expect(getContributorsInfo(ref, d)).rejects.toMatchObject({ kind: "rate-limit" });
    expect(calls).toBe(1);
    await expect(isAncestorOfDefault(ref, SHA, "main", d)).rejects.toMatchObject({ kind: "rate-limit" });
    await expect(hasCommitsBy(ref, "x", d)).rejects.toThrow(/checks resume in 20 min/);
    expect(calls).toBe(1); // the flag blocked both
    expect(rateLimitNote(d)).toMatch(/hourly limit for this browser was reached — checks resume in 20 min/);
  });
  it("resumes after the reset time", async () => {
    let t = 600_000;
    let calls = 0;
    const d = mk(async () => { calls++; return calls === 1 ? limited() : json(200, [{ login: "a", contributions: 1 }]); }, () => t);
    await expect(getContributorsInfo(ref, d)).rejects.toThrow();
    t = 1_900_000;
    expect((await getContributorsInfo(ref, d)).list).toHaveLength(1);
  });
});

describe("cache lifetimes", () => {
  it("positive answers live 6 hours in storage, errors and negatives are not cached", async () => {
    const s = store();
    let t = 0;
    let calls = 0;
    const d = () => mk(async () => { calls++; return json(200, [{ login: "a", contributions: 1 }]); }, () => t, s);
    await getContributorsInfo(ref, d());
    t = 5 * 3600_000;
    await getContributorsInfo(ref, d());
    expect(calls).toBe(1);
    t = 7 * 3600_000;
    await getContributorsInfo(ref, d());
    expect(calls).toBe(2);
  });
  it("a missing .katki.json and a not-ancestor answer are not cached", async () => {
    const s = store();
    let calls = 0;
    const d = () => mk(async (u) => { calls++; return String(u).includes("raw.") ? new Response("", { status: 404 }) : json(200, { status: "diverged" }); }, () => 0, s);
    await getKatkiText(ref, SHA, d());
    await getKatkiText(ref, SHA, d());
    await isAncestorOfDefault(ref, SHA, "main", d());
    await isAncestorOfDefault(ref, SHA, "main", d());
    expect(calls).toBe(4);
  });
  it("the ancestor cache key includes the default branch", async () => {
    const s = store();
    const d = mk(async () => json(200, { status: "ahead" }), () => 0, s);
    await isAncestorOfDefault(ref, SHA, "main", d);
    expect([...s.m.keys()].some((k) => k.endsWith(`@${SHA}->main`))).toBe(true);
    let calls = 0;
    const d2 = mk(async () => { calls++; return json(200, { status: "ahead" }); }, () => 0, s);
    await isAncestorOfDefault(ref, SHA, "trunk", d2); // another branch name must not reuse the "main" answer
    expect(calls).toBe(1);
  });
});

describe("repositories with more than 500 contributors", () => {
  const file = JSON.stringify({ version: 1, contributors: [{ github: "alice", wallet: A("1") }, { github: "late-joiner", wallet: A("2") }] });
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ login: i === 0 ? "alice" : `u${i}`, contributions: 1 }));
  const route = (author: (handle: string) => Response): Deps["fetch"] => async (u) => {
    const url = String(u);
    if (url.includes("raw.")) return new Response(file, { status: 200 });
    if (url.includes("/compare/")) return json(200, { status: "ahead" });
    if (url.includes("/commits?author=")) return author(new URL(url).searchParams.get("author") ?? "");
    if (url.includes("/contributors")) return json(200, page(100)); // every page full: truncated
    return json(200, { full_name: "o/r", default_branch: "main", private: false });
  };
  it("a handle outside the cut-off list is checked exactly: a commit by that author means contributor", async () => {
    const r = await readKatkiState("o/r", SHA, mk(route(() => json(200, [{ sha: "x" }]))));
    expect(r.handles.state).toBe("ok");
  });
  it("an empty commit list for the author means not a contributor (mismatch)", async () => {
    const r = await readKatkiState("o/r", SHA, mk(route(() => json(200, []))));
    expect(r.handles.state).toBe("mismatch");
  });
  it("an unreadable exact check is unavailable, never ok", async () => {
    const r = await readKatkiState("o/r", SHA, mk(route(() => json(500, {}))));
    expect(r.handles.state).toBe("unavailable");
  });
  it("more than 5 handles outside the cut-off list are not checked one by one: unavailable, and no exact requests", async () => {
    const many = JSON.stringify({ version: 1, contributors: Array.from({ length: 7 }, (_, i) => ({ github: `late${i}`, wallet: "0x" + String(i + 1).repeat(40) })) });
    let exact = 0;
    const f: Deps["fetch"] = async (u) => {
      const url = String(u);
      if (url.includes("raw.")) return new Response(many, { status: 200 });
      if (url.includes("/compare/")) return json(200, { status: "ahead" });
      if (url.includes("/commits?author=")) { exact++; return json(200, [{}]); }
      if (url.includes("/contributors")) return json(200, page(100));
      return json(200, { full_name: "o/r", default_branch: "main", private: false });
    };
    const r = await readKatkiState("o/r", SHA, mk(f));
    expect(r.handles.state).toBe("unavailable");
    expect(exact).toBe(0);
  });
  it("a short (complete) list does not trigger exact checks: missing handle is a plain mismatch", async () => {
    let exact = 0;
    const f: Deps["fetch"] = async (u) => {
      const url = String(u);
      if (url.includes("raw.")) return new Response(file, { status: 200 });
      if (url.includes("/compare/")) return json(200, { status: "ahead" });
      if (url.includes("/commits?author=")) { exact++; return json(200, [{}]); }
      if (url.includes("/contributors")) return json(200, [{ login: "alice", contributions: 5 }]);
      return json(200, { full_name: "o/r", default_branch: "main", private: false });
    };
    const r = await readKatkiState("o/r", SHA, mk(f));
    expect(r.handles.state).toBe("mismatch");
    expect(exact).toBe(0);
  });
});
