import { formatUnits } from "viem";

const en = "en-US";

export const fmt = {
  /** ETH amount from wei with fixed decimals; tiny non-zero values show as "<0.0001". */
  eth(wei: bigint, d = 4): string {
    const v = Number(formatUnits(wei, 18));
    if (wei > 0n && v < 10 ** -d) return `<${(10 ** -d).toFixed(d)}`;
    return v.toLocaleString(en, { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  ethNum(v: number, d = 4): string {
    return v.toLocaleString(en, { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  /** Token amount from raw units, compact (1.2M, 340k). */
  tokens(raw: bigint, decimals: number): string {
    return fmt.compact(Number(formatUnits(raw, decimals)));
  },
  compact(v: number): string {
    if (!Number.isFinite(v)) return "-";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toLocaleString(en, { maximumFractionDigits: 2 }) + "B";
    if (a >= 1e6) return (v / 1e6).toLocaleString(en, { maximumFractionDigits: 2 }) + "M";
    if (a >= 1e3) return (v / 1e3).toLocaleString(en, { maximumFractionDigits: 1 }) + "k";
    return v.toLocaleString(en, { maximumFractionDigits: a >= 100 ? 0 : 2 });
  },
  /** ETH per token as gwei, with enough digits to be readable at any scale. */
  gwei(ethPerToken: number): string {
    const g = ethPerToken * 1e9;
    if (!Number.isFinite(g) || g === 0) return "0 gwei";
    const digits = g >= 100 ? 1 : g >= 1 ? 2 : g >= 0.01 ? 4 : 6;
    return `${g.toLocaleString(en, { minimumFractionDigits: digits, maximumFractionDigits: digits })} gwei`;
  },
  pct(v: number, d = 1): string {
    return `${v.toLocaleString(en, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
  },
  bpsPct(bps: number, d = 1): string {
    return fmt.pct(bps / 100, d);
  },
  int(v: number): string {
    return Math.round(v).toLocaleString(en);
  },
  short(addr: string): string {
    return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  },
  dateUtc(ms: number): string {
    const d = new Date(ms);
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  },
  day(ms: number): string {
    return fmt.dateUtc(ms).split(",")[0] as string;
  },
  ago(ms: number, now = Date.now()): string {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60) return `${s} s ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  },
};

/** Parses a decimal string typed by the user into raw units. Returns null for empty, negative or malformed input. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [whole = "0", frac = ""] = t.split(".");
  const f = frac.slice(0, decimals).padEnd(decimals, "0");
  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(f || "0");
  } catch {
    return null;
  }
}
