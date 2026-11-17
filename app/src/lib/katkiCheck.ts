/**
 * Reads .katki.json at the commit recorded in a launch (raw.githubusercontent.com: no API quota) and checks the
 * repository side: is that commit on the default branch, and are the listed handles real contributors?
 * 404 / invalid / not an ancestor / unknown handle are facts about the repository (mismatch);
 * network and rate-limit are "could not check" (unverifiable).
 */
import { getContributors, getKatkiText, getRepoInfo, isAncestorOfDefault, parseRepoInput, GitHubError, defaultDeps, type Deps } from "./github";
import { checkAgainstHistory, parseKatki, type KatkiFile } from "./katki";
import type { KatkiState, RepoCheck } from "./verify";

export type KatkiRead = { state: KatkiState; file: KatkiFile | null; provenance: RepoCheck; handles: RepoCheck };

const unavailableCheck = (e: unknown): RepoCheck => ({ state: "unavailable", reason: e instanceof GitHubError && e.kind === "rate-limit" ? "rate limit" : "network" });
const skipped: RepoCheck = { state: "ok" }; // irrelevant: the file itself already failed

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
    return { state: { state: "unavailable", reason: u.state === "unavailable" ? u.reason : "network" }, file: null, provenance: u, handles: u };
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
  const handles: Promise<RepoCheck> = (async () => {
    try {
      const history = await getContributors(ref, deps);
      const c = checkAgainstHistory(file, history);
      return c.ok ? ({ state: "ok" } as RepoCheck) : { state: "mismatch", detail: c.errors.map((x) => x.message).join(" ") };
    } catch (e) {
      if (e instanceof GitHubError && e.kind === "not-found") return { state: "mismatch", detail: "The repository named in the launch was not found, or it is private." };
      return unavailableCheck(e);
    }
  })();
  return { state, file, provenance: await provenance, handles: await handles };
}
