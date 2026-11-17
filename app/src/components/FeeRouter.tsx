import { useEffect, useMemo, useRef, useState } from "react";
import { Av } from "./ui";
import { fmt } from "../lib/format";

export type RouterRow = { name: string; bps: number; detail: string; av: string };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One fee stream branching into contributor lines whose thickness is their share. A pulse travels one branch every 3.6 s. */
export function FeeRouter({ rows, paused, onPausedChange }: { rows: RouterRow[]; paused: boolean; onPausedChange?: (p: boolean) => void }) {
  const ROW = 44;
  const narrow = typeof window !== "undefined" && window.innerWidth < 480;
  const GX = narrow ? 64 : 92;
  const TRUNK = narrow ? 20 : 30;
  const H = rows.length * ROW;
  const mid = H / 2;
  const pulseRef = useRef<SVGCircleElement>(null);
  const routes = useRef<(SVGPathElement | null)[]>([]);
  const [tick, setTick] = useState(0);
  void onPausedChange;

  const geom = useMemo(
    () =>
      rows.map((r, i) => {
        const y = i * ROW + ROW / 2;
        const d = `M${TRUNK} ${mid}C${TRUNK + 34} ${mid} ${GX - 38} ${y} ${GX} ${y}`;
        return { d, full: `M6 ${mid}H${TRUNK}${d.slice(d.indexOf("C"))}`, w: (0.9 + (r.bps / 100) * 0.13).toFixed(2) };
      }),
    [rows, mid, GX, TRUNK],
  );

  useEffect(() => {
    if (paused || reduced() || rows.length === 0) return;
    const id = setInterval(() => {
      const total = rows.reduce((a, r) => a + r.bps, 0);
      let target = Math.random() * total;
      let pick = 0;
      for (let i = 0; i < rows.length; i++) {
        target -= (rows[i] as RouterRow).bps;
        if (target <= 0) { pick = i; break; }
      }
      const path = routes.current[pick];
      const pulse = pulseRef.current;
      if (!path || !pulse) return;
      const len = path.getTotalLength();
      const t0 = performance.now();
      pulse.setAttribute("opacity", "1");
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        const pt = path.getPointAtLength(len * e);
        pulse.setAttribute("cx", String(pt.x));
        pulse.setAttribute("cy", String(pt.y));
        if (k < 1) requestAnimationFrame(step);
        else pulse.setAttribute("opacity", "0");
      };
      requestAnimationFrame(step);
      setTick((t) => t + 1);
    }, 3600);
    return () => clearInterval(id);
  }, [paused, rows]);
  void tick;

  return (
    <div className="router-graph">
      <div style={{ position: "relative", paddingLeft: GX + 8 }}>
        <svg viewBox={`0 0 ${GX} ${H}`} width={GX} height={H} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: GX, height: H }}>
          <path d={`M6 ${mid}H${TRUNK}`} className="trunk" strokeWidth={5} />
          {geom.map((g, i) => (
            <g key={i}>
              <path d={g.d} className={`branch${reduced() ? "" : " draw"}`} strokeWidth={g.w} style={reduced() ? undefined : ({ "--len": 200, animationDelay: `${120 + i * 60}ms` } as React.CSSProperties)} />
              <path d={g.full} fill="none" stroke="none" ref={(el) => { routes.current[i] = el; }} />
            </g>
          ))}
          <circle cx={6} cy={mid} r={5} className="node" />
          <circle ref={pulseRef} r={3} className="pulse" opacity={0} />
        </svg>
        <ul>
          {rows.map((r) => (
            <li key={r.name} style={{ height: ROW, display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto", gap: 10, alignItems: "center", fontSize: 14 }}>
              <Av seed={r.av} small />
              <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 550 }}>{r.name}</span>
                <span className="faint num" style={{ fontSize: 12 }}>{fmt.bpsPct(r.bps)} of fees</span>
              </span>
              <span className="num" style={{ fontWeight: 600 }}>{r.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
