/**
 * `.katki.json` parsing and validation. Pure functions.
 *
 * Schema (version 1): { "version": 1, "contributors": [ { "github": "user", "wallet": "0x..." } ] }
 * There is no weight in the file: the site derives it from the GitHub commit counts.
 */
import { getAddress, isAddress } from "viem";
import type { Weighted } from "./split";

export type KatkiEntry = { github: string; wallet: `0x${string}` };
export type KatkiFile = { version: 1; contributors: KatkiEntry[] };
export type RepoContributor = { login: string; contributions: number };

export type KatkiIssue = { code: string; message: string; github?: string };

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const MAX_FILE_BYTES = 64 * 1024;

export const WALLET_PLACEHOLDER = "0xYOUR_WALLET_ADDRESS";
export const isPlaceholderWallet = (w: string) => /^0x(\.\.\.|YOUR)|YOUR_WALLET|ADDRESS$/i.test(w.trim());

export type ParseResult = { ok: true; file: KatkiFile; warnings: KatkiIssue[] } | { ok: false; errors: KatkiIssue[] };

/** Parses the text of a `.katki.json`. Checks shape, handles and addresses. It does not look at GitHub. */
export function parseKatki(text: string): ParseResult {
  const errors: KatkiIssue[] = [];
  const warnings: KatkiIssue[] = [];
  if (text.length > MAX_FILE_BYTES) return { ok: false, errors: [{ code: "too-large", message: ".katki.json is larger than 64 KB." }] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ code: "bad-json", message: `.katki.json is not valid JSON: ${(e as Error).message}` }] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: [{ code: "bad-shape", message: ".katki.json must be a JSON object." }] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) errors.push({ code: "bad-version", message: `"version" must be 1, found ${JSON.stringify(obj.version)}.` });
  if (!Array.isArray(obj.contributors) || obj.contributors.length === 0) {
    errors.push({ code: "no-contributors", message: '"contributors" must be a non-empty array.' });
    return { ok: false, errors };
  }
  const seenLogin = new Map<string, number>();
  const seenWallet = new Map<string, string>();
  const entries: KatkiEntry[] = [];
  obj.contributors.forEach((item, i) => {
    const at = `contributors[${i}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push({ code: "bad-entry", message: `${at} must be an object with "github" and "wallet".` });
      return;
    }
    const e = item as Record<string, unknown>;
    const github = typeof e.github === "string" ? e.github.trim() : "";
    const wallet = typeof e.wallet === "string" ? e.wallet.trim() : "";
    if (!GITHUB_LOGIN.test(github)) {
      errors.push({ code: "bad-github", message: `${at}.github is not a valid GitHub username: ${JSON.stringify(e.github)}.`, github: github || undefined });
      return;
    }
    const key = github.toLowerCase();
    if (seenLogin.has(key)) {
      errors.push({ code: "duplicate-user", message: `${github} is listed twice (contributors[${seenLogin.get(key)}] and ${at}).`, github });
      return;
    }
    seenLogin.set(key, i);
    if (isPlaceholderWallet(wallet)) {
      errors.push({ code: "placeholder-wallet", message: `${github}: "${wallet}" is a placeholder. Replace it with your wallet address.`, github });
      return;
    }
    if (!isAddress(wallet, { strict: true })) {
      errors.push({ code: "bad-wallet", message: `${github}: "${wallet}" is not a valid wallet address (0x followed by 40 hex characters, with a correct checksum if it has capitals).`, github });
      return;
    }
    const checksummed = getAddress(wallet);
    if (/^0x0{40}$/.test(wallet)) {
      errors.push({ code: "zero-wallet", message: `${github}: the zero address cannot receive fees.`, github });
      return;
    }
    const other = seenWallet.get(checksummed);
    if (other) {
      errors.push({ code: "duplicate-wallet", message: `${github} and ${other} use the same wallet ${checksummed}.`, github });
      return;
    }
    seenWallet.set(checksummed, github);
    if ("weight" in e) warnings.push({ code: "weight-ignored", message: `${github}: "weight" is ignored. Shares come from GitHub commit counts.`, github });
    entries.push({ github, wallet: checksummed });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, file: { version: 1, contributors: entries }, warnings };
}

export type CheckResult =
  | { ok: true; eligible: Weighted[] }
  | { ok: false; errors: KatkiIssue[] };

/** Joins the file with the repo's GitHub contributors. A listed user who is not a repo contributor is an error. */
export function checkAgainstHistory(file: KatkiFile, history: readonly RepoContributor[]): CheckResult {
  const byLogin = new Map(history.map((h) => [h.login.toLowerCase(), h.contributions]));
  const errors: KatkiIssue[] = [];
  const eligible: Weighted[] = [];
  for (const c of file.contributors) {
    const commits = byLogin.get(c.github.toLowerCase());
    if (!commits || commits <= 0) {
      errors.push({ code: "not-a-contributor", message: `${c.github} is not a contributor to this repository on GitHub, so they have no commits to weigh.`, github: c.github });
      continue;
    }
    eligible.push({ github: c.github, wallet: c.wallet, commits });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, eligible };
}

/** Repo contributors who are not in the file (shown as "not included"). */
export function missingFromFile(file: KatkiFile, history: readonly RepoContributor[]): RepoContributor[] {
  const listed = new Set(file.contributors.map((c) => c.github.toLowerCase()));
  return history.filter((h) => !listed.has(h.login.toLowerCase()));
}

/** Template shown when the repo has no file: logins from history, wallets left empty. */
export function templateFor(history: readonly RepoContributor[], limit = 4): string {
  const rows = history.slice(0, limit).map((h) => ({ github: h.login, wallet: WALLET_PLACEHOLDER }));
  return JSON.stringify({ version: 1, contributors: rows.length ? rows : [{ github: "your-handle", wallet: WALLET_PLACEHOLDER }] }, null, 2);
}
