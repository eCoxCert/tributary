/**
 * Anonymous GitHub REST access (60 requests per hour per IP). Results are cached in sessionStorage.
 * The `.katki.json` file itself is read from raw.githubusercontent.com at a pinned commit, which does not count
 * against the API quota.
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
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
};

const MEMO = new Map<string, Promise<unknown>>();

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
    storage = typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    storage = null;
  }
  return { fetch: (...a) => fetch(...a), storage, now: () => Date.now(), memo: MEMO };
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

const CACHE_TTL_MS = 10 * 60 * 1000;

function readCache<T>(deps: Deps, key: string): T | undefined {
  try {
    const raw = deps.storage?.getItem(`trib:gh:${key}`);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    if (deps.now() - t > CACHE_TTL_MS) return undefined;
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

async function api(deps: Deps, path: string): Promise<Response> {
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
      const when = resetAt ? ` The limit resets at ${resetAt.toISOString().slice(11, 16)} UTC.` : "";
      throw new GitHubError("rate-limit", `GitHub allows 60 anonymous requests per hour from one network, and that limit is used up.${when} Results already loaded stay cached for this session.`, resetAt);
    }
  }
  if (res.status === 404) throw new GitHubError("not-found", "Repository not found, or it is private. Tributary can read public repositories only.");
  if (!res.ok) throw new GitHubError("bad-response", `GitHub answered with HTTP ${res.status}.`);
  return res;
}

export function getRepoInfo(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoInfo> {
  return once(deps, `info:${ref.owner}/${ref.name}`.toLowerCase(), () => getRepoInfoRaw(ref, deps));
}

async function getRepoInfoRaw(ref: RepoRef, deps: Deps): Promise<RepoInfo> {
  const key = `repo:${ref.owner}/${ref.name}`.toLowerCase();
  const hit = readCache<RepoInfo>(deps, key);
  if (hit) return hit;
  const res = await api(deps, `/repos/${ref.owner}/${ref.name}`);
  const j = (await res.json()) as { full_name?: string; default_branch?: string; stargazers_count?: number; language?: string | null; private?: boolean; html_url?: string };
  if (!j.full_name || !j.default_branch) throw new GitHubError("bad-response", "GitHub returned an unexpected repository record.");
  const info: RepoInfo = { fullName: j.full_name, defaultBranch: j.default_branch, stars: j.stargazers_count ?? 0, language: j.language ?? null, isPrivate: j.private === true, htmlUrl: j.html_url ?? `https://github.com/${j.full_name}` };
  writeCache(deps, key, info);
  return info;
}

/** Latest commit on the default branch: the pinned commit the file is read at and recorded with. */
export async function getHeadSha(ref: RepoRef, branch: string, deps: Deps = defaultDeps()): Promise<string> {
  const key = `head:${ref.owner}/${ref.name}@${branch}`.toLowerCase();
  const hit = readCache<string>(deps, key);
  if (hit) return hit;
  const res = await api(deps, `/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(branch)}`);
  const j = (await res.json()) as { sha?: string };
  if (!j.sha || !/^[0-9a-f]{40}$/i.test(j.sha)) throw new GitHubError("bad-response", "GitHub returned an unexpected commit record.");
  writeCache(deps, key, j.sha);
  return j.sha;
}

/** Reads `.katki.json` at a commit. Returns null when the file does not exist. */
export async function getKatkiText(ref: RepoRef, sha: string, deps: Deps = defaultDeps()): Promise<string | null> {
  const key = `katki:${ref.owner}/${ref.name}@${sha}`.toLowerCase();
  const hit = readCache<{ text: string | null }>(deps, key);
  if (hit) return hit.text;
  let res: Response;
  try {
    res = await deps.fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.name}/${sha}/.katki.json`);
  } catch {
    throw new GitHubError("network", "GitHub could not be reached. Check your connection and try again.");
  }
  if (res.status === 404) {
    writeCache(deps, key, { text: null });
    return null;
  }
  if (!res.ok) throw new GitHubError("bad-response", `GitHub answered with HTTP ${res.status} while reading .katki.json.`);
  const text = await res.text();
  writeCache(deps, key, { text });
  return text;
}

/** Repo contributors with commit counts (login only; anonymous authors have no handle and are skipped). Up to 5 pages of 100. */
export function getContributors(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoContributor[]> {
  return once(deps, `contrib:${ref.owner}/${ref.name}`.toLowerCase(), () => getContributorsRaw(ref, deps));
}

async function getContributorsRaw(ref: RepoRef, deps: Deps): Promise<RepoContributor[]> {
  const key = `contrib:${ref.owner}/${ref.name}`.toLowerCase();
  const hit = readCache<RepoContributor[]>(deps, key);
  if (hit) return hit;
  const out: RepoContributor[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await api(deps, `/repos/${ref.owner}/${ref.name}/contributors?per_page=100&page=${page}`);
    const j = (await res.json()) as { login?: string; contributions?: number; type?: string }[];
    if (!Array.isArray(j)) throw new GitHubError("bad-response", "GitHub returned an unexpected contributor list.");
    for (const c of j) if (c.login && typeof c.contributions === "number") out.push({ login: c.login, contributions: c.contributions });
    if (j.length < 100) break;
  }
  writeCache(deps, key, out);
  return out;
}

/**
 * Is `sha` part of the default branch's history? (GET compare/{sha}...{branch}: "ahead" or "identical" means yes.)
 * "behind" / "diverged" / 404 mean the commit is not an ancestor, e.g. a fork's commit. Cached per (repo, sha).
 */
export type AncestorCheck = "ancestor" | "not-ancestor";
export function isAncestorOfDefault(ref: RepoRef, sha: string, branch: string, deps: Deps = defaultDeps()): Promise<AncestorCheck> {
  const key = `anc:${ref.owner}/${ref.name}@${sha}`.toLowerCase();
  return once(deps, key, async () => {
    const hit = readCache<AncestorCheck>(deps, key);
    if (hit) return hit;
    let res: Response;
    try {
      res = await deps.fetch(`https://api.github.com/repos/${ref.owner}/${ref.name}/compare/${sha}...${encodeURIComponent(branch)}`, { headers: { Accept: "application/vnd.github+json" } });
    } catch {
      throw new GitHubError("network", "GitHub could not be reached.");
    }
    if (res.status === 404 || res.status === 422) {
      writeCache(deps, key, "not-ancestor");
      return "not-ancestor" as AncestorCheck;
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      throw new GitHubError("rate-limit", "GitHub's anonymous request limit is used up.", Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : undefined);
    }
    if (!res.ok) throw new GitHubError("bad-response", `GitHub answered with HTTP ${res.status}.`);
    const j = (await res.json()) as { status?: string };
    const out: AncestorCheck = j.status === "ahead" || j.status === "identical" ? "ancestor" : "not-ancestor";
    writeCache(deps, key, out);
    return out;
  });
}
