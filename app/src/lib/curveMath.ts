/**
 * Bonding curve geometry from the Config segments (Q64.64 sqrt prices, concentrated-liquidity maths).
 * Floating point is fine here: it only draws the chart and labels. Quotes and trades come from the contract.
 *
 * For a segment [Sa, Sb] with liquidity L (all raw integers):
 *   base sold      = L * (1/Sa - 1/Sb)          (raw base units)
 *   quote paid     = L * (Sb - Sa) / 2^128      (raw quote units, before fee)
 *   price (raw quote per raw base) = (S / 2^64)^2
 * Checked against Config #30 on GIWA Sepolia: base ~ 0.9 * supply and quote = 0.1 ETH = migrationQuoteThreshold.
 */

export type Segment = { lowerSqrtPrice: bigint; upperSqrtPrice: bigint; liquidity: bigint };

const Q64 = 2 ** 64;
const Q128 = 2 ** 128;
const n = (v: bigint) => Number(v);

export type CurvePoint = { baseSold: number; quoteRaised: number; price: number; sqrt: bigint };

/** Raw quote per raw base at a sqrt price. */
export function rawPrice(sqrt: bigint): number {
  const s = n(sqrt) / Q64;
  return s * s;
}

/** Whole quote per whole base (e.g. ETH per token) from a raw price. */
export function humanPrice(raw: number, baseDecimals: number, quoteDecimals = 18): number {
  return (raw * 10 ** baseDecimals) / 10 ** quoteDecimals;
}

/** Base units sold and quote units raised moving from `from` up to `to` inside one segment. */
export function segmentDelta(seg: Segment, from: bigint, to: bigint): { base: number; quote: number } {
  const L = n(seg.liquidity);
  const a = n(from);
  const b = n(to);
  return { base: L * (1 / a - 1 / b), quote: (L * (b - a)) / Q128 };
}

/** Total base sold and quote raised when the curve is filled end to end. */
export function curveTotals(segments: readonly Segment[]): { base: number; quote: number } {
  let base = 0;
  let quote = 0;
  for (const s of segments) {
    const d = segmentDelta(s, s.lowerSqrtPrice, s.upperSqrtPrice);
    base += d.base;
    quote += d.quote;
  }
  return { base, quote };
}

/** Where a sqrt price sits on the curve: cumulative base sold and quote raised from the start. */
export function positionAt(segments: readonly Segment[], sqrt: bigint): { baseSold: number; quoteRaised: number } {
  let baseSold = 0;
  let quoteRaised = 0;
  for (const s of segments) {
    if (sqrt <= s.lowerSqrtPrice) break;
    const upTo = sqrt >= s.upperSqrtPrice ? s.upperSqrtPrice : sqrt;
    const d = segmentDelta(s, s.lowerSqrtPrice, upTo);
    baseSold += d.base;
    quoteRaised += d.quote;
    if (sqrt < s.upperSqrtPrice) break;
  }
  return { baseSold, quoteRaised };
}

/** Sqrt price reached after selling `baseSold` raw base units from the start (inverse of positionAt). */
export function sqrtAtBase(segments: readonly Segment[], baseSold: number): bigint {
  let left = baseSold;
  for (const s of segments) {
    const cap = segmentDelta(s, s.lowerSqrtPrice, s.upperSqrtPrice).base;
    if (left <= cap) {
      const L = n(s.liquidity);
      const inv = 1 / n(s.lowerSqrtPrice) - left / L;
      return BigInt(Math.round(1 / inv));
    }
    left -= cap;
  }
  const last = segments[segments.length - 1];
  return last ? last.upperSqrtPrice : 0n;
}

/** Sample the curve for drawing: evenly spaced in base sold. */
export function sampleCurve(segments: readonly Segment[], points = 64): CurvePoint[] {
  const total = curveTotals(segments).base;
  if (!(total > 0)) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const baseSold = (total * i) / points;
    const sqrt = sqrtAtBase(segments, baseSold);
    out.push({ baseSold, quoteRaised: positionAt(segments, sqrt).quoteRaised, price: rawPrice(sqrt), sqrt });
  }
  return out;
}

/**
 * Estimated base received for `quoteIn` raw quote units spent from the start of the curve, after a fee in bps.
 * Used only to set a floor (minimum out) for the owner's first buy; the contract enforces the real price.
 */
export function estimateFirstBuy(segments: readonly Segment[], quoteIn: bigint, feeBps: number): bigint {
  let left = (Number(quoteIn) * (10_000 - feeBps)) / 10_000;
  let base = 0;
  for (const s of segments) {
    const cap = segmentDelta(s, s.lowerSqrtPrice, s.upperSqrtPrice);
    if (left >= cap.quote) {
      base += cap.base;
      left -= cap.quote;
      continue;
    }
    const L = Number(s.liquidity);
    const sa = Number(s.lowerSqrtPrice);
    const sb = sa + (left * Q128) / L;
    base += L * (1 / sa - 1 / sb);
    left = 0;
    break;
  }
  return BigInt(Math.floor(base));
}
