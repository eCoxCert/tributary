import { describe, expect, it } from "vitest";
import { commitsToBps, planRecipients, rankByCommits, selectVaultRecipients, type Weighted } from "./split";

const w = (github: string, commits: number): Weighted => ({ github, wallet: "0x" + "1".repeat(40), commits });
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("commitsToBps", () => {
  it("adds up to exactly 10000", () => {
    for (const set of [[1, 1, 1], [120, 60, 15, 5], [7, 11, 13, 17, 19], [1, 1], [3, 3, 3, 3, 3], [999, 1]]) {
      expect(sum(commitsToBps(set))).toBe(10_000);
    }
  });
  it("gives the rounding difference to the largest share", () => {
    // 1/3 each: floor 3333 x3 = 9999, the missing bp goes to the first of the equal largest
    expect(commitsToBps([1, 1, 1])).toEqual([3334, 3333, 3333]);
    // 120/60/15/5 of 200: 6000, 3000, 750, 250 exactly
    expect(commitsToBps([120, 60, 15, 5])).toEqual([6000, 3000, 750, 250]);
    // 5/3/3 of 11: floor 4545, 2727, 2727 = 9999 -> largest (first) gets +1
    expect(commitsToBps([5, 3, 3])).toEqual([4546, 2727, 2727]);
  });
  it("floors each share, so the smaller one is not rounded up", () => {
    expect(commitsToBps([1, 6])).toEqual([1428, 8572]);
  });
  it("never produces a zero share", () => {
    const bps = commitsToBps([100000, 1]);
    expect(Math.min(...bps)).toBeGreaterThanOrEqual(1);
    expect(sum(bps)).toBe(10_000);
  });
  it("rejects non-positive counts", () => {
    expect(() => commitsToBps([3, 0])).toThrow();
    expect(() => commitsToBps([3, -1])).toThrow();
  });
});

describe("rankByCommits", () => {
  it("sorts by commits, ties by handle", () => {
    const r = rankByCommits([w("zed", 5), w("Amy", 5), w("bob", 9)]);
    expect(r.map((x) => x.github)).toEqual(["bob", "Amy", "zed"]);
  });
});

describe("selectVaultRecipients", () => {
  it("keeps the top 5 and lists the rest as excluded", () => {
    const list = [w("a", 10), w("b", 80), w("c", 30), w("d", 5), w("e", 50), w("f", 20), w("g", 1)];
    const r = selectVaultRecipients(list);
    expect(r.ok).toBe(true);
    expect(r.included.map((x) => x.github)).toEqual(["b", "e", "c", "f", "a"]);
    expect(r.excluded.map((x) => x.github)).toEqual(["d", "g"]);
    expect(sum(r.included.map((x) => x.bps))).toBe(10_000);
  });
  it("rescales among the included only", () => {
    const r = selectVaultRecipients([w("a", 50), w("b", 50)]);
    expect(r.included.map((x) => x.bps)).toEqual([5000, 5000]);
  });
  it("breaks ties at the cut-off by handle", () => {
    const list = [w("a", 9), w("b", 9), w("c", 9), w("d", 9), w("e", 9), w("f", 9), w("g", 9)];
    const r = selectVaultRecipients(list);
    expect(r.included.map((x) => x.github)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.excluded.map((x) => x.github)).toEqual(["f", "g"]);
  });
  it("blocks the launch with fewer than 2 eligible contributors", () => {
    const one = selectVaultRecipients([w("solo", 40)]);
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.reason).toMatch(/at least 2/);
    expect(selectVaultRecipients([]).ok).toBe(false);
  });
  it("ignores entries without commits", () => {
    expect(selectVaultRecipients([w("a", 0), w("b", 4)]).ok).toBe(false);
  });
});

describe("planRecipients (who gets the fee)", () => {
  it("exactly one eligible contributor: direct payment, 100%, no vault", () => {
    const p = planRecipients([w("solo", 40)]);
    expect(p.ok && p.mode).toBe("direct");
    expect(p.included.map((x) => x.bps)).toEqual([10_000]);
    expect(p.excluded).toEqual([]);
  });
  it("two to five or more: the fee vault", () => {
    const two = planRecipients([w("a", 5), w("b", 5)]);
    expect(two.ok && two.mode).toBe("vault");
    expect(planRecipients([1, 2, 3, 4, 5, 6, 7].map((n) => w("u" + n, n))).included).toHaveLength(5);
  });
  it("nobody eligible: blocked with a reason", () => {
    const p = planRecipients([]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/nobody to pay/);
    expect(planRecipients([w("x", 0)]).ok).toBe(false);
  });
});
