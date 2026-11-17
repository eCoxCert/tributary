/**
 * Reads .katki.json at the commit recorded in a launch (raw.githubusercontent.com: no API quota) and says what
 * it found. 404 and invalid are facts about the repository; network and rate-limit are "could not check".
 */
import { getKatkiText, parseRepoInput, GitHubError, defaultDeps, type Deps } from "./github";
import { parseKatki, type KatkiFile } from "./katki";
import type { KatkiState } from "./verify";

export type KatkiRead = { state: KatkiState; file: KatkiFile | null };

export async function readKatkiState(repo: string, sha: string, deps: Deps = defaultDeps()): Promise<KatkiRead> {
  const ref = parseRepoInput(repo);
  if (!ref) return { state: { state: "invalid" }, file: null };
  try {
    const text = await getKatkiText(ref, sha, deps);
    if (text === null) return { state: { state: "missing" }, file: null };
    const p = parseKatki(text);
    if (!p.ok) return { state: { state: "invalid" }, file: null };
    return { state: { state: "ok", wallets: p.file.contributors.map((c) => c.wallet) }, file: p.file };
  } catch (e) {
    return { state: { state: "unavailable", reason: e instanceof GitHubError ? (e.kind === "rate-limit" ? "rate limit" : "network") : "network" }, file: null };
  }
}
