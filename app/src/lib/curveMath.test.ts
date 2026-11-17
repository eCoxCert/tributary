import { describe, expect, it } from "vitest";
import { curveTotals, humanPrice, positionAt, rawPrice, sampleCurve, sqrtAtBase, type Segment } from "./curveMath";

// Real Config #30 on GIWA Sepolia (see docs/TECH.md): 1 segment, 9-decimal token, WETH quote.
const seg: Segment = { lowerSqrtPrice: 2608763565066556416n, upperSqrtPrice: 14477358857511795412n, liquidity: 2867082064358026102837738063181702589n };
const SUPPLY = 999999999999999999;
const THRESHOLD = 1e17;

describe("curve maths against the real Config #30", () => {
  it("fills 0.1 ETH (migrationQuoteThreshold) with ~90% of supply", () => {
    const t = curveTotals([seg]);
    expect(t.quote / THRESHOLD).toBeGreaterThan(0.999);
    expect(t.quote / THRESHOLD).toBeLessThan(1.001);
    expect(t.base / SUPPLY).toBeGreaterThan(0.89);
    expect(t.base / SUPPLY).toBeLessThan(0.91);
  });
  it("start price matches the live quote (1e14 wei in -> 4.9278e15 raw out, 1% fee)", () => {
    const p = rawPrice(seg.lowerSqrtPrice); // raw quote per raw base
    const out = (1e14 * 0.99) / p;
    expect(out / 4.927805093620512e15).toBeGreaterThan(0.99);
    expect(out / 4.927805093620512e15).toBeLessThan(1.01);
    expect(humanPrice(p, 9)).toBeCloseTo(2e-11, 13); // ETH per token
  });
  it("positionAt is zero at the start and full at the end", () => {
    expect(positionAt([seg], seg.lowerSqrtPrice)).toEqual({ baseSold: 0, quoteRaised: 0 });
    const end = positionAt([seg], seg.upperSqrtPrice);
    expect(end.quoteRaised / THRESHOLD).toBeCloseTo(1, 3);
  });
  it("sqrtAtBase inverts positionAt", () => {
    const total = curveTotals([seg]).base;
    const mid = sqrtAtBase([seg], total / 2);
    expect(positionAt([seg], mid).baseSold / (total / 2)).toBeCloseTo(1, 6);
  });
  it("sampleCurve rises monotonically", () => {
    const pts = sampleCurve([seg], 32);
    expect(pts).toHaveLength(33);
    for (let i = 1; i < pts.length; i++) expect((pts[i] as { price: number }).price).toBeGreaterThan((pts[i - 1] as { price: number }).price);
  });
  it("handles several segments", () => {
    const mid = (seg.lowerSqrtPrice + seg.upperSqrtPrice) / 2n;
    const two: Segment[] = [
      { lowerSqrtPrice: seg.lowerSqrtPrice, upperSqrtPrice: mid, liquidity: seg.liquidity },
      { lowerSqrtPrice: mid, upperSqrtPrice: seg.upperSqrtPrice, liquidity: seg.liquidity },
    ];
    const a = curveTotals(two);
    const b = curveTotals([seg]);
    expect(a.base / b.base).toBeCloseTo(1, 9);
    expect(a.quote / b.quote).toBeCloseTo(1, 9);
  });
});
