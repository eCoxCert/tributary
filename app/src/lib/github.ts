/**
 * Anonymous GitHub REST access (60 requests per hour per IP).
 *  - Positive answers (ancestor = yes, contributor lists, repository records, file text) are cached in localStorage
 *    for 6 hours. Negative answers and errors are never cached.
 *  - Calls for one repo are shared on a page (memo).
 *  - When the hourly limit is hit, the reset time is read from x-ratelimit-reset and no further request is sent
 *    until then (global flag, also kept in storage).
 *  - `.katki.json` itself is read from raw.githubusercontent.com at a pinned commit: no API quota.
 */
import type { RepoContributor } from "./katki";

export class GitHubError extends Error {
  constructor(
    public kind: "not-found" | "rate-limit" | "network" | "bad-response",
    message: string,
    public resetAt?: Date,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export type RepoRef = { owner: string; name: string };
export type RepoInfo = { fullName: string; defaultBranch: string; stars: number; language: string | null; isPrivate: boolean; htmlUrl: string };

export type Deps = {
  /** In-flight and finished requests of this page, so one repo is asked once. */
  memo?: Map<string, Promise<unknown>>;
  /** Shared "rate limited until" flag. */
  limit?: { until: number | null };
  /** Overrides the cache lifetime (the Create form wants fresh data). */
  ttl?: number;
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
};

export const TTL_LONG_MS = 6 * 60 * 60 * 1000;
export const TTL_SHORT_MS = 10 * 60 * 1000;
const LIMIT_KEY = "trib:gh:limit";

const MEMO = new Map<string, Promise<unknown>>();
const LIMIT: { until: number | null } = { until: null };

async function once<T>(deps: Deps, key: string, fn: () => Promise<T>): Promise<T> {
  const m = deps.memo;
  if (!m) return fn();
  const hit = m.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().catch((e) => {
    m.delete(key);
    throw e;
  });
  m.set(key, p);
  return p;
}

export function defaultDeps(): Deps {
  let storage: Deps["storage"] = null;
  try {
    storage = typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    storage = null;
  }
  return { fetch: (...a) => fetch(...a), storage, now: () => Date.now(), memo: MEMO, limit: LIMIT };
}

/** Accepts "owner/name", a github.com URL, with or without .git or a trailing slash. */
export function parseRepoInput(input: string): RepoRef | null {
  const v = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(v);
  if (!m) return null;
  return { owner: m[1] as string, name: m[2] as string };
}

function readCache<T>(deps: Deps, key: string, long: boolean): T | undefined {
  try {
    const raw = deps.storage?.getItem(`trib:gh:${key}`);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    if (deps.now() - t > (deps.ttl ?? (long ? TTL_LONG_MS : TTL_SHORT_MS))) return undefined;
    return v;
  } catch {
    return undefined;
  }
}
function writeCache<T>(deps: Deps, key: string, v: T) {
  try {
    deps.storage?.setItem(`trib:gh:${key}`, JSON.stringify({ t: deps.now(), v }));
  } catch {
    /* storage full or blocked: caching is optional */
  }
}

/* ------------------------------------------------------------ rate limit */

function limitUntil(deps: Deps): number | null {
  const now = deps.now();
  let until = deps.limit?.until ?? null;
  if (until === null) {
    try {
      const raw = deps.storage?.getItem(LIMIT_KEY);
      if (raw && Number.isFinite(Number(raw))) until = Number(raw);
    } catch {
      /* ignore */
    }
  }
  return until !== null && until > now ? until : null;
}
function markLimited(deps: Deps, resetAt?: Date) {
  const until = resetAt ? resetAt.getTime() : deps.now() + 60 * 60 * 1000;
  if (deps.limit) deps.limit.until = until;
  try {
    deps.storage?.setItem(LIMIT_KEY, String(until));
  } catch {
    /* ignore */
  }
}
export function rateLimitMessage(until: number, now: number): string {
  const mins = Math.max(1, Math.ceil((until - now) / 60_000));
  return `GitHub's hourly limit for this browser was reached — checks resume in ${mins} min.`;
}
/** Non-null while the limit is active: used for notes on the listing pages. */
export function rateLimitNote(deps: Deps = defaultDeps()): string | null {
  const u = limitUntil(deps);
  return u === null ? null : rateLimitMessage(u, deps.now());
}

async function api(deps: Deps, path: string, allow: number[] = []): Promise<Response> {
  const lim = limitUntil(deps);
  if (lim !== null) throw new GitHubError("rate-limit", rateLimitMessage(lim, deps.now()), new Date(lim)); // no request while limited
  let res: Response;
  try {
    res = await deps.fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    throw new GitHubError("network", "GitHub could not be reached. Check your connection and try again. Nothing was sent to the chain.");
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : undefined;
      markLimited(deps, resetAt);
      const until = limitUntil(deps) ?? deps.now() + 60_000;
      throw new GitHubError("rate-limit", rateLimitMessage(until, deps.now()), resetAt);
    }
  }
  if (allow.includes(res.status)) return res;
  if (res.status === 404) throw new GitHubError("not-found", "Repository not found, or it is private. Tributary can read public repositories only.");
  if (!res.ok) throw new GitHubError("bad-response", `GitHub answered with HTTP ${res.status}.`);
  return res;
}

/* ------------------------------------------------------------------ reads */

export function getRepoInfo(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoInfo> {
  return once(deps, `info:${ref.owner}/${ref.name}`.toLowerCase(), async () => {
    const key = `repo:${ref.owner}/${ref.name}`.toLowerCase();
    const hit = readCache<RepoInfo>(deps, key, true);
    if (hit) return hit;
    const res = await api(deps, `/repos/${ref.owner}/${ref.name}`);
    const j = (await res.json()) as { full_name?: string; default_branch?: string; stargazers_count?: number; language?: string | null; private?: boolean; html_url?: string };
    if (!j.full_name || !j.default_branch) throw new GitHubError("bad-response", "GitHub returned an unexpected repository record.");
    const info: RepoInfo = { fullName: j.full_name, defaultBranch: j.default_branch, stars: j.stargazers_count ?? 0, language: j.language ?? null, isPrivate: j.private === true, htmlUrl: j.html_url ?? `https://github.com/${j.full_name}` };
    writeCache(deps, key, info);
    return info;
  });
}

/** Latest commit on the default branch: the pinned commit the file is read at and recorded with. */
export async function getHeadSha(ref: RepoRef, branch: string, deps: Deps = defaultDeps()): Promise<string> {
  const key = `head:${ref.owner}/${ref.name}@${branch}`.toLowerCase();
  const hit = readCache<string>(deps, key, false);
  if (hit) return hit;
  const res = await api(deps, `/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(branch)}`);
  const j = (await res.json()) as { sha?: string };
  if (!j.sha || !/^[0-9a-f]{40}$/i.test(j.sha)) throw new GitHubError("bad-response", "GitHub returned an unexpected commit record.");
  writeCache(deps, key, j.sha);
  return j.sha;
}

/** Reads `.katki.json` at a commit. Returns null when the file does not exist (that answer is not cached). */
export async function getKatkiText(ref: RepoRef, sha: string, deps: Deps = defaultDeps()): Promise<string | null> {
  const key = `katki:${ref.owner}/${ref.name}@${sha}`.toLowerCase();
  const hit = readCache<{ text: string }>(deps, key, true);
  if (hit) return hit.text;
  let res: Response;
  try {
    res = await deps.fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.name}/${sha}/.katki.json`);
  } catch {
    throw new GitHubError("network", "GitHub could not be reached. Check your connection and try again.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new GitHubError("bad-response", `GitHub answered with HTTP ${res.status} while reading .katki.json.`);
  const text = await res.text();
  writeCache(deps, key, { text });
  return text;
}

export type ContributorList = { list: RepoContributor[]; /** The last page was full: there may be more contributors than listed (500 max). */ truncated: boolean };

export function getContributorsInfo(ref: RepoRef, deps: Deps = defaultDeps()): Promise<ContributorList> {
  return once(deps, `contrib:${ref.owner}/${ref.name}`.toLowerCase(), async () => {
    const key = `contrib:${ref.owner}/${ref.name}`.toLowerCase();
    const hit = readCache<ContributorList>(deps, key, true);
    if (hit) return hit;
    const list: RepoContributor[] = [];
    let truncated = false;
    for (let page = 1; page <= 5; page++) {
      const res = await api(deps, `/repos/${ref.owner}/${ref.name}/contributors?per_page=100&page=${page}`);
      const j = (await res.json()) as { login?: string; contributions?: number }[];
      if (!Array.isArray(j)) throw new GitHubError("bad-response", "GitHub returned an unexpected contributor list.");
      for (const c of j) if (c.login && typeof c.contributions === "number") list.push({ login: c.login, contributions: c.contributions });
      if (j.length < 100) break;
      if (page === 5) truncated = true;
    }
    const out = { list, truncated };
    writeCache(deps, key, out);
    return out;
  });
}

/** Repo contributors with commit counts (anonymous authors have no handle and are skipped). */
export async function getContributors(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoContributor[]> {
  return (await getContributorsInfo(ref, deps)).list;
}

/** Exact check for one handle when the contributor list was cut off: does this author have any commit? */
export function hasCommitsBy(ref: RepoRef, handle: string, deps: Deps = defaultDeps()): Promise<boolean> {
  const k = `by:${ref.owner}/${ref.name}:${handle}`.toLowerCase();
  return once(deps, k, async () => {
    const hit = readCache<boolean>(deps, k, true);
    if (hit) return true;
    const res = await api(deps, `/repos/${ref.owner}/${ref.name}/commits?author=${encodeURIComponent(handle)}&per_page=1`);
    const j = (await res.json()) as unknown[];
    if (!Array.isArray(j)) throw new GitHubError("bad-response", "GitHub returned an unexpected commit list.");
    if (j.length > 0) writeCache(deps, k, true);
    return j.length > 0;
  });
}

/**
 * Is `sha` part of the default branch's history? (GET compare/{sha}...{branch}: "ahead" or "identical" means yes.)
 * "behind" / "diverged" / 404 mean the commit is not an ancestor, e.g. a fork's commit.
 * Only "yes" is cached, under a key that includes the branch.
 */
export type AncestorCheck = "ancestor" | "not-ancestor";
export function isAncestorOfDefault(ref: RepoRef, sha: string, branch: string, deps: Deps = defaultDeps()): Promise<AncestorCheck> {
  const key = `anc:${ref.owner}/${ref.name}@${sha}->${branch}`.toLowerCase();
  return once(deps, key, async () => {
    if (readCache<AncestorCheck>(deps, key, true) === "ancestor") return "ancestor" as AncestorCheck;
    let res: Response;
    try {
      res = await api(deps, `/repos/${ref.owner}/${ref.name}/compare/${sha}...${encodeURIComponent(branch)}`, [422]);
    } catch (e) {
      if (e instanceof GitHubError && e.kind === "not-found") return "not-ancestor" as AncestorCheck;
      throw e;
    }
    if (res.status === 422) return "not-ancestor" as AncestorCheck;
    const j = (await res.json()) as { status?: string };
    const out: AncestorCheck = j.status === "ahead" || j.status === "identical" ? "ancestor" : "not-ancestor";
    if (out === "ancestor") writeCache(deps, key, out);
    return out;
  });
}
