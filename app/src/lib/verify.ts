/**
 * A launch counts as a Tributary launch only when the chain agrees with its metadata.
 * Metadata alone is just text anyone can write into a token, so it is never trusted by itself.
 */
export type VerifyInput = {
  metaVault: string;
  partnerRecipient: string;
  creatorShareOfNonProtocolBps: number;
  creator: string;
  vault: { owner: string; recipients: { recipient: string; share: bigint }[] } | null;
  /** Wallets listed in .katki.json at the recorded commit, when that file could be read. */
  listedWallets?: string[] | null;
};

export type Verification = { ok: true } | { ok: false; problems: string[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function verifyTributaryLaunch(i: VerifyInput): Verification {
  const problems: string[] = [];
  if (!eq(i.partnerRecipient, i.metaVault)) problems.push("The launch's fee recipient is not the vault named in its metadata, so trading fees do not go to that vault.");
  if (i.creatorShareOfNonProtocolBps !== 0) problems.push("The launch gives part of the trading fee to its creator instead of sending all of it to the vault.");
  if (!i.vault) {
    problems.push("The fee vault named in the metadata could not be read, so the split cannot be checked.");
  } else {
    if (!eq(i.vault.owner, i.creator)) problems.push("The fee vault is owned by a different wallet than the one that created the launch.");
    if (i.vault.recipients.length < 2 || i.vault.recipients.length > 5) problems.push("The fee vault does not have 2 to 5 recipients.");
    if (i.listedWallets) {
      const listed = new Set(i.listedWallets.map((w) => w.toLowerCase()));
      const stray = i.vault.recipients.filter((r) => !listed.has(r.recipient.toLowerCase()));
      if (stray.length) problems.push(`${stray.length} vault recipient${stray.length > 1 ? "s are" : " is"} not listed in .katki.json at the recorded commit.`);
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}
