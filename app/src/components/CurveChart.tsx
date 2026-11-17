import { useEffect, useId, useRef, useState } from "react";
import { fmt } from "../lib/format";
import { humanPrice, type CurvePoint } from "../lib/curveMath";

export type CurveChartProps = {
  points: CurvePoint[];
  totalBase: number; // raw base units on the curve
  baseDecimals: number;
  nowBase?: number; // raw base sold so far
  windowBase?: number; // raw base bought in the launch transaction (hatched)
  gradLabel: string;
  nowLabel?: string;
  ariaLabel: string;
  height?: number;
  pad?: { l: number; r: number; t: number; b: number };
  lead?: number; // flat lead-in in px (landing phase curve)
  grid?: boolean;
  hover?: boolean;
  animate?: boolean;
  /** Used for the tooltip: raw quote raised per point is already in `points`. */
  quoteDecimals?: number;
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** SVG bonding curve drawn at the real pixel width (resize and theme safe: it only uses CSS variables). */
export function CurveChart(p: CurveChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<SVGPathElement>(null);
  const [W, setW] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; cx: number; cy: number; text: string } | null>(null);
  const hatchId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const path = doneRef.current;
    if (!path || !p.animate || reduced()) return;
    path.style.setProperty("--len", String(path.getTotalLength()));
    path.classList.add("draw");
  }, [p.animate, W > 0, p.points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const qd = p.quoteDecimals ?? 18;
  const Wd = Math.max(280, W);
  const H = p.height ?? (Wd < 560 ? 220 : 300);
  const pad = p.pad ?? { l: 8, r: 8, t: 24, b: 28 };
  const x0 = pad.l + (p.lead ?? 0);
  const x1 = Wd - pad.r;
  const y0 = H - pad.b;
  const y1 = pad.t;
  const pts = p.points;
  const hp = (raw: number) => humanPrice(raw, p.baseDecimals, qd);
  const maxPrice = pts.length ? hp(pts[pts.length - 1]!.price) : 1;
  const pmax = maxPrice * 1.08;
  const X = (f: number) => x0 + f * (x1 - x0);
  const Y = (price: number) => y0 - (price / pmax) * (y0 - y1);
  const frac = (b: number) => (p.totalBase > 0 ? Math.min(1, Math.max(0, b / p.totalBase)) : 0);

  const line = (from: number, to: number, close: boolean) => {
    const sel = pts.filter((q) => frac(q.baseSold) >= from - 1e-9 && frac(q.baseSold) <= to + 1e-9);
    if (sel.length < 2) return "";
    let d = sel.map((q, i) => `${i ? "L" : "M"}${X(frac(q.baseSold)).toFixed(1)} ${Y(hp(q.price)).toFixed(1)}`).join("");
    if (close) d += `L${X(to).toFixed(1)} ${y0}L${X(from).toFixed(1)} ${y0}Z`;
    return d;
  };

  const now = p.nowBase !== undefined ? frac(p.nowBase) : undefined;
  const win = p.windowBase !== undefined ? frac(p.windowBase) : 0;
  const nowPt = now !== undefined && pts.length ? interpolate(pts, now, p.totalBase) : null;
  const gx = Math.round(X(1)) - 0.5;
  const totalTokens = p.totalBase / 10 ** p.baseDecimals;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!p.hover || !pts.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * Wd;
    const f = Math.min(1, Math.max(0, (px - x0) / (x1 - x0)));
    const q = interpolate(pts, f, p.totalBase);
    const price = hp(q.price);
    setTip({
      cx: X(f),
      cy: Y(price),
      x: (X(f) / Wd) * r.width,
      y: (Y(price) / H) * r.height,
      text: `${fmt.compact(q.baseSold / 10 ** p.baseDecimals)} sold · ${fmt.gwei(price)} · ${fmt.ethNum(q.quoteRaised / 10 ** qd, 4)} ETH raised`,
    });
  }

  if (!pts.length) return <div className="chart" ref={hostRef} />;

  return (
    <div className="chart" ref={hostRef}>
      <svg viewBox={`0 0 ${Wd} ${H}`} width={Wd} height={H} role="img" aria-label={p.ariaLabel} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--accent-wash)" />
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>
        {p.grid && (
          <>
            <g className="grid">
              {[0, 1, 2, 3, 4].map((i) => {
                const yy = Math.round(y1 + (i * (y0 - y1)) / 4) + 0.5;
                return <line key={i} x1={x0} x2={x1} y1={yy} y2={yy} />;
              })}
            </g>
            <g className="axis">
              {[0, 1, 2, 3].map((j) => (
                <text key={j} x={x0 + 4} y={Math.round(y1 + (j * (y0 - y1)) / 4) - 5}>
                  {fmt.gwei((pmax * (4 - j)) / 4)}
                </text>
              ))}
              {[0, 1, 2, 3, 4].map((k) => (
                <text key={k} x={X(k / 4)} y={H - 8} textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}>
                  {k === 0 ? "0" : fmt.compact((totalTokens * k) / 4)}
                </text>
              ))}
            </g>
          </>
        )}
        {now !== undefined && now > 0 && <path d={line(0, now, true)} className="area" />}
        {win > 0 && <path d={line(0, Math.min(win, now ?? win), true)} className="area-window" style={{ fill: `url(#${hatchId})` }} />}
        {p.lead ? <line x1={pad.l} x2={x0} y1={y0 - 0.5} y2={y0 - 0.5} className="curve" /> : null}
        <path d={line(now ?? 0, 1, false)} className="curve-ahead" />
        <path ref={doneRef} d={line(0, now ?? 1, false)} className="curve" />
        <line x1={gx} x2={gx} y1={y1 - 12} y2={y0} className="grad-line" />
        <text x={gx - 6} y={y1 - 2} textAnchor="end" className="lbl">
          {p.gradLabel}
        </text>
        {nowPt && now !== undefined && now > 0 && now < 1 && (
          <>
            <circle cx={X(now)} cy={Y(hp(nowPt.price))} r={9} className="now-ring" />
            <circle cx={X(now)} cy={Y(hp(nowPt.price))} r={4} className="now" />
            {p.nowLabel && (
              <text x={X(now) + 12} y={Y(hp(nowPt.price)) + 4} className="lbl-strong">
                {p.nowLabel}
              </text>
            )}
          </>
        )}
        {tip && (
          <>
            <line y1={y1} y2={y0} x1={tip.cx} x2={tip.cx} className="xhair" />
            <circle cx={tip.cx} cy={tip.cy} r={4} className="xdot" />
          </>
        )}
      </svg>
      {p.hover && (
        <div className={`chart-tip${tip ? " is-on" : ""}`} style={tip ? { left: tip.x, top: tip.y } : undefined}>
          {tip?.text}
        </div>
      )}
    </div>
  );
}

/** Linear interpolation of the sampled curve at a fraction of the total base. */
export function interpolate(pts: CurvePoint[], f: number, totalBase: number): CurvePoint {
  const target = f * totalBase;
  let i = 1;
  while (i < pts.length - 1 && pts[i]!.baseSold < target) i++;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const span = b.baseSold - a.baseSold || 1;
  const t = Math.min(1, Math.max(0, (target - a.baseSold) / span));
  return { baseSold: target, quoteRaised: a.quoteRaised + (b.quoteRaised - a.quoteRaised) * t, price: a.price + (b.price - a.price) * t, sqrt: b.sqrt };
}
