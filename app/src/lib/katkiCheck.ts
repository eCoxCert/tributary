/**
 * Reads .katki.json at the commit recorded in a launch (raw.githubusercontent.com: no API quota) and checks the
 * repository side: is that commit on the default branch, and are the listed handles real contributors?
 * 404 / invalid / not an ancestor / unknown handle are facts about the repository (mismatch);
 * network and rate-limit are "could not check" (unverifiable). `reason` is a full sentence for the reader.
 */
import { getContributorsInfo, getKatkiText, getRepoInfo, hasCommitsBy, isAncestorOfDefault, parseRepoInput, GitHubError, defaultDeps, type Deps, type RepoRef } from "./github";
import { checkAgainstHistory, parseKatki, type KatkiFile } from "./katki";
import type { KatkiState, RepoCheck } from "./verify";

export type KatkiRead = { state: KatkiState; file: KatkiFile | null; provenance: RepoCheck; handles: RepoCheck };

const unavailableCheck = (e: unknown): RepoCheck => ({ state: "unavailable", reason: e instanceof GitHubError ? e.message : "GitHub could not be reached." });
const skipped: RepoCheck = { state: "ok" }; // irrelevant: the file itself already failed
export const MAX_EXACT_CHECKS = 5;

/**
 * Handles must be repository contributors. GitHub's contributor list stops at 500 people, so when it was cut off a
 * handle that is missing from it is checked exactly (any commit by that author), for at most 5 handles.
 */
export async function resolveHandles(file: KatkiFile, ref: RepoRef, deps: Deps): Promise<RepoCheck> {
  try {
    const { list, truncated } = await getContributorsInfo(ref, deps);
    const c = checkAgainstHistory(file, list);
    if (c.ok) return { state: "ok" };
    if (!truncated) return { state: "mismatch", detail: c.errors.map((x) => x.message).join(" ") };
    const missing = c.errors.map((e) => e.github).filter((g): g is string => !!g);
    if (missing.length > MAX_EXACT_CHECKS) return { state: "unavailable", reason: `This repository has more than 500 contributors and ${missing.length} listed handles are outside the list GitHub returns, which is too many to check one by one.` };
    const strangers: string[] = [];
    for (const h of missing) if (!(await hasCommitsBy(ref, h, deps))) strangers.push(h);
    return strangers.length ? { state: "mismatch", detail: `${strangers.join(", ")} ${strangers.length > 1 ? "are" : "is"} not a contributor to this repository on GitHub.` } : { state: "ok" };
  } catch (e) {
    if (e instanceof GitHubError && e.kind === "not-found") return { state: "mismatch", detail: "The repository named in the launch was not found, or it is private." };
    return unavailableCheck(e);
  }
}

export async function readKatkiState(repo: string, sha: string, deps: Deps = defaultDeps()): Promise<KatkiRead> {
  const ref = parseRepoInput(repo);
  if (!ref) return { state: { state: "invalid" }, file: null, provenance: skipped, handles: skipped };
  let file: KatkiFile;
  let state: KatkiState;
  try {
    const text = await getKatkiText(ref, sha, deps);
    if (text === null) return { state: { state: "missing" }, file: null, provenance: skipped, handles: skipped };
    const p = parseKatki(text);
    if (!p.ok) return { state: { state: "invalid" }, file: null, provenance: skipped, handles: skipped };
    file = p.file;
    state = { state: "ok", wallets: p.file.contributors.map((c) => c.wallet) };
  } catch (e) {
    const u = unavailableCheck(e);
    return { state: { state: "unavailable", reason: u.state === "unavailable" ? u.reason : "GitHub could not be reached." }, file: null, provenance: u, handles: u };
  }

  const provenance: Promise<RepoCheck> = (async () => {
    try {
      const info = await getRepoInfo(ref, deps);
      const r = await isAncestorOfDefault(ref, sha, info.defaultBranch, deps);
      return r === "ancestor" ? ({ state: "ok" } as RepoCheck) : { state: "mismatch", detail: `The commit recorded in the launch is not part of ${info.fullName}'s ${info.defaultBranch} branch (it may come from a fork).` };
    } catch (e) {
      if (e instanceof GitHubError && e.kind === "not-found") return { state: "mismatch", detail: "The repository named in the launch was not found, or it is private." };
      return unavailableCheck(e);
    }
  })();
  const handles = resolveHandles(file, ref, deps);
  return { state, file, provenance: await provenance, handles: await handles };
}
