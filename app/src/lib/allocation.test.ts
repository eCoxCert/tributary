import { describe, expect, it } from "vitest";
import { runDistribution, splitAllocation, splitByShares } from "./allocation";
import { estimateFirstBuy, type Segment } from "./curveMath";
import { readRepository } from "./readRepo";
import type { Deps } from "./github";

describe("splitAllocation", () => {
  it("adds up to the total and gives the remainder to the largest share", () => {
    const parts = splitAllocation(1000n, [5000, 3000, 2000]);
    expect(parts).toEqual([500n, 300n, 200n]);
    const odd = splitAllocation(1001n, [5000, 3000, 2000]);
    expect(odd.reduce((a, b) => a + b, 0n)).toBe(1001n);
    expect(odd[0]).toBe(501n);
  });
  it("rejects shares that do not add up", () => {
    expect(() => splitAllocation(10n, [5000, 4000])).toThrow();
    expect(() => splitByShares(10n, [1n, 0n])).toThrow();
  });
});

describe("estimateFirstBuy", () => {
  const seg: Segment = { lowerSqrtPrice: 2608763565066556416n, upperSqrtPrice: 14477358857511795412n, liquidity: 2867082064358026102837738063181702589n };
  it("matches the live quote for 1e14 wei (4.9278e15 raw out)", () => {
    const out = Number(estimateFirstBuy([seg], 10n ** 14n, 100));
    expect(out / 4.927805093620512e15).toBeGreaterThan(0.99);
    expect(out / 4.927805093620512e15).toBeLessThan(1.01);
  });
});

function res(status: number, body: unknown, h: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: h });
}
const W = (c: string) => "0x" + c.repeat(40);
function deps(katki: string | null, contributors: unknown[]): Deps {
  return {
    storage: null,
    now: () => 0,
    fetch: async (u) => {
      const url = String(u);
      if (url.includes("raw.githubusercontent")) return katki === null ? res(404, "") : res(200, katki);
      if (url.includes("/contributors")) return res(200, contributors);
      if (url.includes("/commits/")) return res(200, { sha: "a".repeat(40) });
      return res(200, { full_name: "o/r", default_branch: "main", private: false });
    },
  };
}

describe("readRepository", () => {
  const file = (names: string[]) => JSON.stringify({ version: 1, contributors: names.map((n, i) => ({ github: n, wallet: W(String(i + 1)) })) });
  it("finds the file and selects recipients", async () => {
    const r = await readRepository("o/r", deps(file(["a", "b"]), [{ login: "a", contributions: 30 }, { login: "b", contributions: 10 }]));
    expect(r.stage).toBe("found");
    if (r.stage === "found") expect(r.selection.ok && r.selection.included.map((x) => x.bps)).toEqual([7500, 2500]);
  });
  it("reports a missing file", async () => {
    expect((await readRepository("o/r", deps(null, []))).stage).toBe("missing");
  });
  it("fails validation for a non-contributor", async () => {
    expect((await readRepository("o/r", deps(file(["a", "ghost"]), [{ login: "a", contributions: 3 }]))).stage).toBe("invalid");
  });
  it("one eligible contributor is paid directly, no vault", async () => {
    const r = await readRepository("o/r", deps(file(["a"]), [{ login: "a", contributions: 3 }]));
    expect(r.stage === "found" && r.selection.ok && r.selection.mode).toBe("direct");
    expect(r.stage === "found" && r.selection.included.map((x) => (x as { bps: number }).bps)).toEqual([10000]);
  });
  it("rejects a bad repo string", async () => {
    expect((await readRepository("nope", deps(null, []))).stage).toBe("error");
  });
});

describe("runDistribution", () => {
  it("does not pay twice after a partial failure", async () => {
    const chain = new Map<string, bigint>(); // what each wallet has received on chain
    const paid: [string, bigint][] = [];
    const items = [{ wallet: "a", due: 100n }, { wallet: "b", due: 50n }, { wallet: "c", due: 25n }];
    let failB = true;
    const run = () =>
      runDistribution({
        items,
        readSent: async (w) => chain.get(w) ?? 0n,
        send: async (w, amt) => {
          if (w === "b" && failB) throw new Error("rejected");
          chain.set(w, (chain.get(w) ?? 0n) + amt);
          paid.push([w, amt]);
        },
      });
    await expect(run()).rejects.toThrow("rejected");
    failB = false;
    await run();
    expect(paid).toEqual([["a", 100n], ["b", 50n], ["c", 25n]]);
  });
  it("sends only the remainder when a wallet was already part-paid", async () => {
    const sent: bigint[] = [];
    await runDistribution({ items: [{ wallet: "a", due: 100n }], readSent: async () => 60n, send: async (_w, a) => void sent.push(a) });
    expect(sent).toEqual([40n]);
  });
});
