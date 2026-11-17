import { describe, expect, it } from "vitest";
import { scanRanges, splitRanges, splitRangesNewestFirst, withRetry } from "./logs";

describe("splitRanges", () => {
  it("splits into chunks of at most 10000 blocks that cover the span exactly", () => {
    const r = splitRanges(1n, 25_000n);
    expect(r).toEqual([
      { from: 1n, to: 10_000n },
      { from: 10_001n, to: 20_000n },
      { from: 20_001n, to: 25_000n },
    ]);
    for (const x of r) expect(x.to - x.from + 1n).toBeLessThanOrEqual(10_000n);
  });
  it("handles an exact multiple, a single block and an empty span", () => {
    expect(splitRanges(0n, 9_999n)).toEqual([{ from: 0n, to: 9_999n }]);
    expect(splitRanges(5n, 5n)).toEqual([{ from: 5n, to: 5n }]);
    expect(splitRanges(10n, 9n)).toEqual([]);
  });
  it("has no gaps or overlaps", () => {
    const r = splitRanges(41_000_123n, 41_063_457n);
    for (let i = 1; i < r.length; i++) expect((r[i] as { from: bigint }).from).toBe((r[i - 1] as { to: bigint }).to + 1n);
    expect(r[0]?.from).toBe(41_000_123n);
    expect(r[r.length - 1]?.to).toBe(41_063_457n);
  });
  it("can go newest first", () => {
    const r = splitRangesNewestFirst(1n, 20_000n);
    expect(r[0]).toEqual({ from: 10_001n, to: 20_000n });
  });
  it("rejects a zero chunk size", () => {
    expect(() => splitRanges(1n, 2n, 0n)).toThrow();
  });
});

describe("withRetry", () => {
  it("retries and then succeeds", async () => {
    let calls = 0;
    const delays: number[] = [];
    const v = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("over rate limit");
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms), baseDelayMs: 100 },
    );
    expect(v).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]);
  });
  it("gives up after the retry budget", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error("down"); }, { retries: 2, sleep: async () => {} }),
    ).rejects.toThrow("down");
    expect(calls).toBe(3);
  });
});

describe("scanRanges", () => {
  it("never runs more than 3 requests at once and keeps range order", async () => {
    const ranges = splitRanges(0n, 99_999n); // 10 chunks
    let inflight = 0;
    let peak = 0;
    const out = await scanRanges(ranges, async (r) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((res) => setTimeout(res, 5));
      inflight--;
      return [Number(r.from / 10_000n)];
    });
    expect(peak).toBe(3);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("retries a failing chunk without losing the others", async () => {
    const ranges = splitRanges(0n, 29_999n);
    const seen = new Map<string, number>();
    const out = await scanRanges(
      ranges,
      async (r) => {
        const k = String(r.from);
        const n = (seen.get(k) ?? 0) + 1;
        seen.set(k, n);
        if (r.from === 10_000n && n < 3) throw new Error("over rate limit");
        return [k];
      },
      { sleep: async () => {} },
    );
    expect(out).toEqual(["0", "10000", "20000"]);
    expect(seen.get("10000")).toBe(3);
  });
});
