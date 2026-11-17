import { describe, expect, it } from "vitest";
import { getContributors, getHeadSha, getKatkiText, GitHubError, parseRepoInput, type Deps } from "./github";

function mem(): Deps["storage"] {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}
const ref = { owner: "tidewater", name: "quill-rpc" };

describe("parseRepoInput", () => {
  it("accepts owner/name and github urls", () => {
    expect(parseRepoInput("tidewater/quill-rpc")).toEqual(ref);
    expect(parseRepoInput("https://github.com/tidewater/quill-rpc/")).toEqual(ref);
    expect(parseRepoInput("https://www.github.com/tidewater/quill-rpc.git")).toEqual(ref);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "tidewater", "a/b/c", "https://gitlab.com/a/b", "-x/y", "a b/c"]) expect(parseRepoInput(bad)).toBeNull();
  });
});

describe("github cache and errors", () => {
  it("caches contributors in storage so the second call does not hit the network", async () => {
    let calls = 0;
    const deps: Deps = {
      fetch: async () => { calls++; return res(200, [{ login: "mira-k", contributions: 9 }]); },
      storage: mem(),
      now: () => 1000,
    };
    const a = await getContributors(ref, deps);
    const b = await getContributors(ref, deps);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });
  it("expires the cache after the TTL", async () => {
    let calls = 0;
    let t = 0;
    const deps: Deps = { fetch: async () => { calls++; return res(200, []); }, storage: mem(), now: () => t };
    await getContributors(ref, deps);
    t = 11 * 60 * 1000;
    await getContributors(ref, deps);
    expect(calls).toBe(2);
  });
  it("turns a rate limit into a readable error with the reset time", async () => {
    const deps: Deps = {
      fetch: async () => res(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" }),
      storage: null,
      now: () => 0,
    };
    await expect(getContributors(ref, deps)).rejects.toMatchObject({ kind: "rate-limit" });
    try {
      await getContributors(ref, deps);
    } catch (e) {
      expect((e as GitHubError).message).toMatch(/60 anonymous requests per hour/);
      expect((e as GitHubError).resetAt).toBeInstanceOf(Date);
    }
  });
  it("treats a 403 with quota left as a plain bad response, not a rate limit", async () => {
    const deps: Deps = { fetch: async () => res(403, {}, { "x-ratelimit-remaining": "40" }), storage: null, now: () => 0 };
    await expect(getContributors(ref, deps)).rejects.toMatchObject({ kind: "bad-response" });
  });
  it("maps 404 to not-found", async () => {
    const deps: Deps = { fetch: async () => res(404, {}), storage: null, now: () => 0 };
    await expect(getHeadSha(ref, "main", deps)).rejects.toMatchObject({ kind: "not-found" });
  });
  it("returns null for a missing .katki.json and caches that answer", async () => {
    let calls = 0;
    const deps: Deps = { fetch: async () => { calls++; return res(404, "404: Not Found"); }, storage: mem(), now: () => 0 };
    const sha = "a".repeat(40);
    expect(await getKatkiText(ref, sha, deps)).toBeNull();
    expect(await getKatkiText(ref, sha, deps)).toBeNull();
    expect(calls).toBe(1);
  });
  it("pages through contributors until a short page", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ login: `u${i}`, contributions: 1 }));
    const urls: string[] = [];
    const deps: Deps = {
      fetch: async (u) => { urls.push(String(u)); return res(200, urls.length === 1 ? page(100) : page(7)); },
      storage: null,
      now: () => 0,
    };
    const all = await getContributors(ref, deps);
    expect(all).toHaveLength(107);
    expect(urls).toHaveLength(2);
  });
});
