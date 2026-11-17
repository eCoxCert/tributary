/**
 * Everything the Create page learns from GitHub, in one pure-ish function (network through `Deps`).
 * Result stages mirror the prototype: error, missing .katki.json, invalid file, found.
 */
import { getContributors, getHeadSha, getKatkiText, getRepoInfo, GitHubError, parseRepoInput, defaultDeps, type Deps, type RepoInfo, type RepoRef } from "./github";
import { checkAgainstHistory, missingFromFile, parseKatki, templateFor, type KatkiFile, type KatkiIssue, type RepoContributor } from "./katki";
import { selectVaultRecipients, type VaultSelection } from "./split";

export type ReadResult =
  | { stage: "error"; message: string; retryable: boolean }
  | { stage: "missing"; ref: RepoRef; info: RepoInfo; sha: string; template: string; authors: number }
  | { stage: "invalid"; ref: RepoRef; info: RepoInfo; sha: string; errors: KatkiIssue[]; warnings: KatkiIssue[] }
  | {
      stage: "found";
      ref: RepoRef;
      info: RepoInfo;
      sha: string;
      file: KatkiFile;
      warnings: KatkiIssue[];
      history: RepoContributor[];
      selection: VaultSelection;
      notInFile: RepoContributor[];
    };

export async function readRepository(input: string, deps: Deps = defaultDeps()): Promise<ReadResult> {
  const ref = parseRepoInput(input);
  if (!ref) return { stage: "error", message: "Enter the repository as owner/name, for example tidewater/quill-rpc.", retryable: false };
  try {
    const info = await getRepoInfo(ref, deps);
    if (info.isPrivate) return { stage: "error", message: `${info.fullName} is private. Tributary can read public repositories only.`, retryable: false };
    const sha = await getHeadSha(ref, info.defaultBranch, deps);
    const text = await getKatkiText(ref, sha, deps);
    if (text === null) {
      let history: RepoContributor[] = [];
      try {
        history = await getContributors(ref, deps);
      } catch {
        /* the template falls back to a placeholder handle */
      }
      return { stage: "missing", ref, info, sha, template: templateFor(history), authors: history.length };
    }
    const parsed = parseKatki(text);
    if (!parsed.ok) return { stage: "invalid", ref, info, sha, errors: parsed.errors, warnings: [] };
    const history = await getContributors(ref, deps);
    const checked = checkAgainstHistory(parsed.file, history);
    if (!checked.ok) return { stage: "invalid", ref, info, sha, errors: checked.errors, warnings: parsed.warnings };
    return {
      stage: "found",
      ref,
      info,
      sha,
      file: parsed.file,
      warnings: parsed.warnings,
      history,
      selection: selectVaultRecipients(checked.eligible),
      notInFile: missingFromFile(parsed.file, history),
    };
  } catch (e) {
    if (e instanceof GitHubError) {
      return { stage: "error", message: e.kind === "not-found" ? `github.com/${ref.owner}/${ref.name} was not found, or it is private. Tributary can read public repositories only.` : e.message, retryable: e.kind !== "not-found" };
    }
    return { stage: "error", message: e instanceof Error ? e.message : "The repository could not be read.", retryable: true };
  }
}
