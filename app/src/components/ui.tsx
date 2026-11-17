import { useState, type ReactNode } from "react";
import { fmt } from "../lib/format";

/* ---------------------------------------------------------- identicons */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** GitHub-style 5x5 mirrored pixel avatar, generated from a seed. Accent for people, ink for repos. */
export function Av({ seed, tone, small }: { seed: string; tone?: "ink"; small?: boolean }) {
  const h = hash(seed);
  const cells: ReactNode[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >> (y * 3 + x)) & 1) {
        cells.push(<rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={1} height={1} />);
        if (x < 2) cells.push(<rect key={`m${x}-${y}`} x={5 - x} y={y + 1} width={1} height={1} />);
      }
    }
  }
  const op = 0.62 + ((h >>> 20) % 38) / 100;
  return (
    <span className={`av${small ? " av-sm" : ""}`}>
      <svg viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges">
        <g fill={tone === "ink" ? "var(--ink-2)" : "var(--accent)"} fillOpacity={op.toFixed(2)}>
          {cells}
        </g>
      </svg>
    </span>
  );
}

/* --------------------------------------------------------------- icons */
export const IconWarn = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M10 2.5 18 17H2L10 2.5Z" />
    <path d="M10 8v4M10 14.2v.3" />
  </svg>
);
export const IconErr = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6v4.5M10 13.2v.3" />
  </svg>
);
export const IconOk = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M4 10.5 8 14.5 16 5.5" />
  </svg>
);
export const IconCheck = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 10.5 8 14.5 16 5.5" />
  </svg>
);
export const IconLock = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="4" y="9" width="12" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);
export const IconDown = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M10 3v14M5 12l5 5 5-5" />
  </svg>
);
export const IconGithub = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
  </svg>
);

/* ------------------------------------------------------------- banners */
export function Banner({ kind, children, action }: { kind: "warn" | "err" | "acc"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${kind}`} role={kind === "err" ? "alert" : "status"}>
      {kind === "warn" ? <IconWarn /> : kind === "err" ? <IconErr /> : <IconOk />}
      <div>{children}</div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- misc */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy"
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
      </svg>
    </button>
  );
}

export function Addr({ value, label, href }: { value: string; label: string; href?: string }) {
  return (
    <span className="addr">
      {href ? (
        <a className="mono" href={href} target="_blank" rel="noreferrer">
          {fmt.short(value)}
        </a>
      ) : (
        <span className="mono">{fmt.short(value)}</span>
      )}
      <CopyButton value={value} label={label} />
    </span>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function Sk({ w, h, r }: { w?: number | string; h?: number; r?: number }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r }} />;
}

export function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={c === 0 ? "full" : undefined}>
              <Sk w={`${c === 0 ? 70 + ((i * 13) % 25) : 50 + ((i * 7 + c * 11) % 40)}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* --------------------------------------------------------------- status */
export type LaunchStatus = "public" | "ready" | "grad" | "pending";
export function StatusTag({ status }: { status: LaunchStatus }) {
  if (status === "grad") return <span className="tag tag-grad">Graduated</span>;
  if (status === "ready") return <span className="tag tag-window">Ready to graduate</span>;
  if (status === "pending") return <span className="tag">Not started</span>;
  return <span className="tag tag-public">Public</span>;
}

/* ---------------------------------------------------------- step lists */
export type StepState = "todo" | "active" | "done" | "error" | "skipped";
export type ProgressStep = { id: string; label: string; state: StepState; note?: string };
export function StepList({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="txsteps" aria-label="Transaction progress">
      {steps.map((s, i) => (
        <li key={s.id} className={`is-${s.state}`}>
          <i>{s.state === "done" ? "✓" : s.state === "error" ? "!" : s.state === "skipped" ? "–" : i + 1}</i>
          <span>
            {s.label}
            {s.note ? <small>{s.note}</small> : null}
          </span>
          {s.state === "active" ? <Spinner /> : null}
        </li>
      ))}
    </ol>
  );
}
