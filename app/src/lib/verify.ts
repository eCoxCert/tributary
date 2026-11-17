/**
 * A launch counts as a Tributary launch only when the chain AND the repository agree with its metadata.
 * Metadata alone is text anyone can write into a token. Three outcomes, and anything that could not be
 * checked is never shown as verified:
 *   verified      every check passed
 *   mismatch      something was checked and does not hold
 *   unverifiable  a check could not be made (network, rate limit, unreadable contract); nothing is claimed
 */
export type ContribFileState =
  | { state: "ok"; wallets: string[] }
  | { state: "missing" } // 404 at the recorded commit
  | { state: "invalid" } // the file exists but fails validation
  | { state: "unavailable"; reason: string }; // network / rate limit

/** Checks on the repository side that are independent of the .tributary.json text. */
export type RepoCheck = { state: "ok" } | { state: "mismatch"; detail: string } | { state: "unavailable"; reason: string };

export type VaultFacts = {
  owner: string;
  recipients: { recipient: string; share: bigint }[];
  token: string;
  base: string;
  /** true: the DFS factory recorded this vault; false: it did not; null: could not be read. */
  fromFactory: boolean | null;
};

export type VerifyInput = {
  /** Exactly one of these two must be set by the launch metadata. */
  metaVault?: string;
  metaRecipient?: string;
  partnerRecipient: string;
  creatorShareOfNonProtocolBps: number;
  creator: string;
  /** Token the vault must pay out (the launch's quote token, WETH). */
  expectedToken: string;
  vault: VaultFacts | null;
  contribFile: ContribFileState;
  /** Is the recorded commit part of the default branch (not a fork's commit)? */
  provenance: RepoCheck;
  /** Are the listed GitHub handles real contributors of the repository? */
  handles: RepoCheck;
};

export type Verification =
  | { status: "verified" }
  | { status: "mismatch"; problems: string[] }
  | { status: "unverifiable"; reasons: string[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function verifyTributaryLaunch(i: VerifyInput): Verification {
  const problems: string[] = [];
  const reasons: string[] = [];
  const direct = i.metaRecipient !== undefined && i.metaVault === undefined;
  const vaulted = i.metaVault !== undefined && i.metaRecipient === undefined;
  const target = direct ? i.metaRecipient : i.metaVault;

  if (!direct && !vaulted) {
    problems.push(i.metaVault !== undefined ? "The launch metadata names both a fee vault and a direct recipient." : "The launch metadata names neither a fee vault nor a direct recipient.");
  } else if (!eq(i.partnerRecipient, target as string)) {
    problems.push(direct ? "The launch's fee recipient is not the wallet named in its metadata, so trading fees do not go to that wallet." : "The launch's fee recipient is not the vault named in its metadata, so trading fees do not go to that vault.");
  }
  if (i.creatorShareOfNonProtocolBps !== 0) problems.push("The launch gives part of the trading fee to its creator instead of sending all of it to the fee recipient.");

  if (vaulted) {
    if (!i.vault) {
      reasons.push("The fee vault named in the metadata could not be read.");
    } else {
      if (!eq(i.vault.owner, i.creator)) problems.push("The fee vault is owned by a different wallet than the one that created the launch.");
      if (i.vault.recipients.length < 2 || i.vault.recipients.length > 5) problems.push("The fee vault does not have 2 to 5 recipients.");
      if (!eq(i.vault.token, i.expectedToken) || !eq(i.vault.base, i.expectedToken)) problems.push("The fee vault does not pay out WETH, the token the launch collects fees in.");
      if (i.vault.fromFactory === false) problems.push("The fee vault was not created by the Ammora fee-sharing factory.");
      if (i.vault.fromFactory === null) reasons.push("The fee-sharing factory's record of this vault could not be read.");
    }
  }

  if (i.contribFile.state === "missing") problems.push("The repository has no .tributary.json at the commit recorded in the launch.");
  else if (i.contribFile.state === "invalid") problems.push("The .tributary.json at the recorded commit is not valid.");
  else if (i.contribFile.state === "unavailable") reasons.push(i.contribFile.reason);
  else if (direct) {
    // one contributor: the file must list exactly this wallet and nobody else
    const w = i.contribFile.wallets.map((x) => x.toLowerCase());
    if (w.length !== 1 || w[0] !== (i.metaRecipient as string).toLowerCase()) problems.push("The .tributary.json at the recorded commit does not list exactly the wallet named in the launch.");
  } else if (vaulted && i.vault) {
    const listed = new Set(i.contribFile.wallets.map((w) => w.toLowerCase()));
    const stray = i.vault.recipients.filter((r) => !listed.has(r.recipient.toLowerCase()));
    if (stray.length) problems.push(`${stray.length} vault recipient${stray.length > 1 ? "s are" : " is"} not listed in .tributary.json at the recorded commit.`);
  }

  for (const c of [i.provenance, i.handles]) {
    if (c.state === "mismatch") problems.push(c.detail);
    else if (c.state === "unavailable") reasons.push(c.reason);
  }

  if (problems.length) return { status: "mismatch", problems };
  if (reasons.length) return { status: "unverifiable", reasons: [...new Set(reasons)] };
  return { status: "verified" };
}

export const isVerified = (v: Verification | null | undefined): boolean => v?.status === "verified";
