import type { VaultSnapshot } from "./launches";
import type { TributaryMeta } from "./metadata";
import { verifyTributaryLaunch, type KatkiState, type RepoCheck, type Verification } from "./verify";

/** Maps what the cards and the launch page read into the pure verifier. Used by both, so they cannot disagree. */
export function verifyLaunch(p: {
  meta: TributaryMeta;
  partnerRecipient: string;
  creatorShareOfNonProtocolBps: number;
  creator: string;
  quoteToken: string;
  vault: VaultSnapshot | null;
  katki: KatkiState;
  provenance: RepoCheck;
  handles: RepoCheck;
}): Verification {
  return verifyTributaryLaunch({
    metaVault: p.meta.vault,
    metaRecipient: p.meta.recipient,
    partnerRecipient: p.partnerRecipient,
    creatorShareOfNonProtocolBps: p.creatorShareOfNonProtocolBps,
    creator: p.creator,
    expectedToken: p.quoteToken,
    vault: p.vault
      ? {
          owner: p.vault.owner,
          token: p.vault.token,
          base: p.vault.base,
          fromFactory: p.vault.fromFactory,
          recipients: p.vault.recipients.map((r) => ({ recipient: r.recipient, share: r.share })),
        }
      : null,
    katki: p.katki,
    provenance: p.provenance,
    handles: p.handles,
  });
}
