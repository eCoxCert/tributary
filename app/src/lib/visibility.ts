import type { Verification } from "./verify";

/**
 * Which launches may be listed. Mismatch is hidden. Unverifiable is NOT hidden (a failed check is not proof of
 * fraud, and hiding every launch whenever GitHub is down would be wrong): it is listed with a neutral
 * "Could not be checked" label and no repository, contributor or fee claims.
 */
export function isListedVerdict(hasMeta: boolean, v: Verification | null, debug: boolean): boolean {
  if (debug) return true;
  if (!hasMeta || !v) return false;
  return v.status === "verified" || v.status === "unverifiable";
}

export type ListState = "loading" | "empty" | "no-match" | "list";

/** What the launches table should show. `visible` counts launches that are listed; `rawCount` is everything found. */
export function listState(p: { scanning: boolean; error: boolean; anyPending: boolean; visible: number; shown: number; rawCount: number }): ListState {
  if (p.scanning && p.rawCount === 0) return "loading";
  if (p.anyPending && p.visible === 0) return "loading";
  if (p.shown > 0) return "list";
  if (p.visible === 0) return p.error ? "list" : "empty"; // raw list may be full while nothing is visible: that is empty, not "no match"
  return "no-match"; // visible launches exist but search/filter hides them all
}

/**
 * Title of a launches row. Only a verified repo (from the launch metadata) is shown as a repo; everything else is the
 * token symbol plus a short address. The token's own name is free text written by whoever launched it, so it is never
 * used as a title and never split on "/" to look like owner/name.
 */
export function rowTitle(verifiedRepo: string | null, symbol: string, token: string): string {
  if (verifiedRepo) return verifiedRepo;
  const short = token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token;
  return `${symbol} · ${short}`;
}

export const plural = (n: number, word: string): string => `${n} ${n === 1 ? word : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`}`;
