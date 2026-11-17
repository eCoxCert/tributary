/**
 * Fee split maths. Pure functions, no I/O.
 *
 * Rules (chief decision 2):
 *  - the fee vault (DFS) takes at most 5 recipients and at least 2;
 *  - the 5 contributors with the most commits are included;
 *  - their shares are rescaled to basis points that add up to exactly 10000;
 *  - the rounding difference goes to the largest share.
 */

export const MAX_RECIPIENTS = 5;
export const MIN_RECIPIENTS = 2;
export const TOTAL_BPS = 10_000;

export type Weighted = { github: string; wallet: string; commits: number };
export type Allocated = Weighted & { bps: number };

/** Highest commit count first; ties are broken by handle (case-insensitive) so the pick is deterministic. */
export function rankByCommits<T extends { github: string; commits: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.commits - a.commits || a.github.toLowerCase().localeCompare(b.github.toLowerCase()));
}

/**
 * Converts commit counts into basis points that add up to exactly 10000.
 * Each share is floored; the rounding difference goes to the largest share (first in order on a tie).
 * A share is never below 1 bp (the vault rejects a zero share); the extra bp comes from the largest share.
 */
export function commitsToBps(commits: readonly number[]): number[] {
  if (commits.length === 0) return [];
  if (commits.some((c) => !Number.isFinite(c) || c <= 0)) throw new Error("Every commit count must be a positive number.");
  const total = commits.reduce((a, c) => a + c, 0);
  const bps = commits.map((c) => Math.max(1, Math.floor((c * TOTAL_BPS) / total)));
  let largest = 0;
  for (let i = 1; i < commits.length; i++) if ((commits[i] as number) > (commits[largest] as number)) largest = i;
  const diff = TOTAL_BPS - bps.reduce((a, b) => a + b, 0);
  bps[largest] = (bps[largest] as number) + diff;
  if ((bps[largest] as number) < 1) throw new Error("Shares cannot be scaled to 10000 basis points.");
  return bps;
}

export type VaultSelection =
  | { ok: true; included: Allocated[]; excluded: Weighted[]; totalCommitsIncluded: number }
  | { ok: false; reason: string; included: Allocated[]; excluded: Weighted[]; totalCommitsIncluded: number };

/** Picks the vault recipients out of the validated `.katki.json` contributors. */
export function selectVaultRecipients(eligible: readonly Weighted[]): VaultSelection {
  const ranked = rankByCommits(eligible.filter((e) => e.commits > 0));
  const top = ranked.slice(0, MAX_RECIPIENTS);
  const excluded = ranked.slice(MAX_RECIPIENTS);
  const totalCommitsIncluded = top.reduce((a, c) => a + c.commits, 0);
  if (top.length < MIN_RECIPIENTS) {
    return {
      ok: false,
      reason: `The fee vault needs at least ${MIN_RECIPIENTS} contributors who are in .katki.json and have commits. This repository has ${top.length}.`,
      included: [],
      excluded: [...top, ...excluded],
      totalCommitsIncluded: 0,
    };
  }
  const bps = commitsToBps(top.map((t) => t.commits));
  return { ok: true, included: top.map((t, i) => ({ ...t, bps: bps[i] as number })), excluded, totalCommitsIncluded };
}
