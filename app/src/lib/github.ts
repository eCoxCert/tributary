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
  fetch: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now: () => number;
};

export function defaultDeps(): Deps {
  let storage: Deps["storage"] = null;
  try {
    storage = typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    storage = null;
  }
  return { fetch: (...a) => fetch(...a), storage, now: () => Date.now() };
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

export async function getRepoInfo(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoInfo> {
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
export async function getContributors(ref: RepoRef, deps: Deps = defaultDeps()): Promise<RepoContributor[]> {
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
