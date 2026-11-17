import { describe, expect, it } from "vitest";
import { readRepository } from "./readRepo";
import { githubNewFileUrl, parseContribFile, templateFor } from "./contribFile";
import type { Deps } from "./github";

const SHA1 = "1".repeat(40);
const SHA2 = "2".repeat(40);
const W = "0x" + "a".repeat(40);
const file = JSON.stringify({ version: 1, contributors: [{ github: "solo", wallet: W }] });
const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("Check again uses the newest commit", () => {
  it("a head sha cached from the first read does not hide a file pushed afterwards", async () => {
    const storage = store();
    let head = SHA1;
    const deps = (): Deps => ({
      storage,
      now: () => 0,
      ttl: 10 * 60 * 1000,
      fetch: async (u) => {
        const url = String(u);
        if (url.includes("raw.githubusercontent")) return url.includes(SHA2) ? res(200, file) : res(404, "");
        if (url.includes("/commits/")) return res(200, { sha: head });
        if (url.includes("/contributors")) return res(200, [{ login: "solo", contributions: 4 }]);
        return res(200, { full_name: "o/r", default_branch: "main", private: false });
      },
    });
    const first = await readRepository("o/r", deps());
    expect(first.stage).toBe("missing");
    head = SHA2; // the user pushes .tributary.json
    const second = await readRepository("o/r", deps());
    expect(second.stage).toBe("found");
    if (second.stage === "found") expect(second.sha).toBe(SHA2);
  });
});

describe("making the file easy to create", () => {
  it("fills in the connected wallet for the chosen contributor only", () => {
    const json = JSON.parse(templateFor([{ login: "solo", contributions: 9 }, { login: "other", contributions: 2 }], 4, { github: "Solo", wallet: W }));
    expect(json.contributors[0].wallet).toBe(W);
    expect(json.contributors[1].wallet).toBe("0xYOUR_WALLET_ADDRESS");
  });
  it("a template with a filled wallet for the only contributor validates", () => {
    const text = templateFor([{ login: "solo", contributions: 9 }], 4, { github: "solo", wallet: "0x8c1F0000000000000000000000000000000a4a2E".toLowerCase() });
    expect(parseContribFile(text).ok).toBe(true);
  });
  it("a template that still has placeholders is rejected by the validator", () => {
    expect(parseContribFile(templateFor([{ login: "solo", contributions: 9 }])).ok).toBe(false);
  });
  it("encodes the file content, even when it contains % or &", () => {
    const json = 'a%41&b=c';
    const url = githubNewFileUrl({ owner: "o", name: "r" }, "main", json);
    expect(decodeURIComponent(url.split("value=")[1] as string)).toBe(json);
  });
  it("builds GitHub's new-file link with the name and the encoded content", () => {
    const url = githubNewFileUrl({ owner: "eCoxCert", name: "tributary" }, "main", '{ "version": 1 }');
    expect(url.startsWith("https://github.com/eCoxCert/tributary/new/main?filename=.tributary.json&value=")).toBe(true);
    expect(decodeURIComponent(url.split("value=")[1] as string)).toBe('{ "version": 1 }');
  });
});
