import { describe, expect, it } from "vitest";
import { isAncestorOfDefault, type Deps } from "./github";
import { readKatkiState } from "./katkiCheck";

const A = (c: string) => "0x" + c.repeat(40);
const ref = { owner: "o", name: "r" };
const SHA = "a".repeat(40);
const file = JSON.stringify({ version: 1, contributors: [{ github: "alice", wallet: A("1") }, { github: "bob", wallet: A("2") }] });
const json = (status: number, body: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: h });

type Route = { compare?: () => Response; contributors?: () => Response; raw?: () => Response };
function deps(r: Route, calls: string[] = []): Deps {
  return {
    memo: new Map(),
    storage: null,
    now: () => 0,
    fetch: async (u) => {
      const url = String(u);
      calls.push(url);
      if (url.includes("raw.githubusercontent")) return r.raw ? r.raw() : new Response(file, { status: 200 });
      if (url.includes("/compare/")) return r.compare ? r.compare() : json(200, { status: "ahead" });
      if (url.includes("/contributors")) return r.contributors ? r.contributors() : json(200, [{ login: "alice", contributions: 9 }, { login: "bob", contributions: 3 }]);
      return json(200, { full_name: "o/r", default_branch: "main", private: false });
    },
  };
}

describe("isAncestorOfDefault", () => {
  it("ahead and identical are ancestors; behind, diverged and 404 are not", async () => {
    for (const [status, want] of [["ahead", "ancestor"], ["identical", "ancestor"], ["behind", "not-ancestor"], ["diverged", "not-ancestor"]] as const) {
      expect(await isAncestorOfDefault(ref, SHA, "main", deps({ compare: () => json(200, { status }) }))).toBe(want);
    }
    expect(await isAncestorOfDefault(ref, SHA, "main", deps({ compare: () => json(404, {}) }))).toBe("not-ancestor");
  });
  it("rate limit is an error (unavailable), not a verdict", async () => {
    await expect(isAncestorOfDefault(ref, SHA, "main", deps({ compare: () => json(403, {}, { "x-ratelimit-remaining": "0" }) }))).rejects.toMatchObject({ kind: "rate-limit" });
  });
  it("asks GitHub once per (repo, sha) on a page, even when called together", async () => {
    const calls: string[] = [];
    const d = deps({}, calls);
    await Promise.all([isAncestorOfDefault(ref, SHA, "main", d), isAncestorOfDefault(ref, SHA, "main", d), isAncestorOfDefault(ref, SHA, "main", d)]);
    expect(calls.filter((c) => c.includes("/compare/"))).toHaveLength(1);
  });
});

describe("readKatkiState repository checks", () => {
  it("passes when the commit is on the default branch and handles are contributors", async () => {
    const r = await readKatkiState("o/r", SHA, deps({}));
    expect(r.provenance.state).toBe("ok");
    expect(r.handles.state).toBe("ok");
  });
  it("a fork's commit (diverged) is a provenance mismatch", async () => {
    expect((await readKatkiState("o/r", SHA, deps({ compare: () => json(200, { status: "diverged" }) }))).provenance.state).toBe("mismatch");
  });
  it("a listed handle that is not a contributor is a handles mismatch", async () => {
    const r = await readKatkiState("o/r", SHA, deps({ contributors: () => json(200, [{ login: "alice", contributions: 9 }]) }));
    expect(r.handles.state).toBe("mismatch");
  });
  it("rate limit on the compare call is unavailable, never ok", async () => {
    const r = await readKatkiState("o/r", SHA, deps({ compare: () => json(403, {}, { "x-ratelimit-remaining": "0" }) }));
    expect(r.provenance.state).toBe("unavailable");
  });
});
