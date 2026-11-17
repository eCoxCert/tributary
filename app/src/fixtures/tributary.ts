/* FIXTURE_ONLY_DEV: fixed fake data for the launch page, loaded only by `vite dev` (never in the production bundle).
 * Open  #/launch/<token>?fixture=ok|mismatch|loading|error  and, for wallet states, &fw=me|owner|wrong|none.
 * The curve, price and quotes are the real EMP launch on GIWA Sepolia; the Tributary side (repo, vault, split,
 * allocation) is invented. */
import type { Address } from "viem";
import { readCurveSnapshot, type VaultSnapshot } from "../lib/launches";
import type { LaunchData, KatkiInfo } from "../hooks/useLaunch";
import type { AllocationRead } from "../lib/allocation";
import { EXAMPLE_CONTRIBUTORS } from "../lib/examples";
import { selectVaultRecipients } from "../lib/split";
import { splitByShares } from "../lib/allocation";
import type { LaunchRecord } from "../lib/launches";

export const FIXTURE_TOKEN = "0xBFc72c693dF1D0DDdE4bfCFa1bB09A162Fe9f032" as Address;
export const FIXTURE_CURVE = "0x2F520e4e7E201E4391E1265625Dec76751dBCd8C" as Address;
export const FIXTURE_OWNER = "0x1111111111111111111111111111111111111111" as Address;
export const FIXTURE_VAULT = "0x2222222222222222222222222222222222222222" as Address;
const FEE_STORE = "0x414Be4a093fDFd7292dCa95C4D6fdD3905Ee6800" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const SHA = "3f9a2c1d4e5b6a7988776655443322110ffeeddc";

const sel = selectVaultRecipients(EXAMPLE_CONTRIBUTORS.map((c) => ({ github: c.github, wallet: c.wallet, commits: c.commits })));
if (!sel.ok) throw new Error("fixture");
const included = sel.included;

export async function fixtureLaunch(kind: string): Promise<LaunchData> {
  if (kind === "loading") return new Promise<LaunchData>(() => {});
  if (kind === "error") throw new Error("The GIWA Sepolia RPC timed out after 10 seconds (fixture).");
  const real = await readCurveSnapshot(FIXTURE_CURVE, FIXTURE_TOKEN);
  const good = kind !== "mismatch";
  if (kind === "info-wait") await new Promise(() => {});
  const snap = good
    ? { ...real, state: { ...real.state, creator: FIXTURE_OWNER, partnerRecipient: FIXTURE_VAULT, feeVault: FEE_STORE }, config: { ...real.config, partnerRecipient: FIXTURE_VAULT, creatorShareOfNonProtocolBps: 0 } }
    : real; // mismatch: the real config names someone else and gives the creator 30% of the fee
  return { token: FIXTURE_TOKEN, curve: FIXTURE_CURVE, snap, meta: { app: "tributary", repo: "tidewater/quill-rpc", katkiCommit: SHA, vault: FIXTURE_VAULT } };
}

export function fixtureVault(kind: string): VaultSnapshot {
  const unclaimed = [31_000_000_000_000000n, 12_000_000_000_000000n, 4_000_000_000_000000n, 2_500_000_000_000000n, 900_000_000_000000n];
  return {
    vault: FIXTURE_VAULT,
    owner: kind === "mismatch" ? (included[0]!.wallet as Address) : FIXTURE_OWNER,
    token: WETH,
    base: WETH,
    fromFactory: true,
    recipients: included.map((r, i) => ({ index: i, recipient: r.wallet as Address, share: BigInt(r.bps), claimed: i === 0 ? 42_000_000_000_000000n : 0n, claimable: unclaimed[i]! })),
    totalShare: 10_000n,
    totalFunded: 60_000_000_000_000000n,
    totalClaimed: 42_000_000_000_000000n,
    pendingInFeeVault: 21_000_000_000_000000n,
    feeVault: FEE_STORE,
    claimSourceEnabled: true,
  };
}

export const fixtureInfo = (kind: string): KatkiInfo => ({
  katki: kind === "unverifiable" ? { state: "unavailable", reason: "rate limit" } : { state: "ok", wallets: EXAMPLE_CONTRIBUTORS.map((c) => c.wallet) },
  file: { version: 1, contributors: EXAMPLE_CONTRIBUTORS.map((c) => ({ github: c.github, wallet: c.wallet as `0x${string}` })) },
  history: [...EXAMPLE_CONTRIBUTORS.map((c) => ({ login: c.github, contributions: c.commits })), { login: "ayo-b", contributions: 31 }],
  repo: { fullName: "tidewater/quill-rpc", defaultBranch: "main", stars: 2140, language: "TypeScript", isPrivate: false, htmlUrl: "https://github.com/tidewater/quill-rpc" },
  notes: [],
});

export const fixtureRecord: LaunchRecord = {
  token: FIXTURE_TOKEN,
  curve: FIXTURE_CURVE,
  creator: FIXTURE_OWNER,
  configId: 30n,
  block: 41_563_000n,
  txHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
  meta: null,
};

export function fixtureAllocation(): AllocationRead {
  const total = 120_000_000_000_000_000n; // 120M tokens at 9 decimals
  const dues = splitByShares(total, included.map((i) => BigInt(i.bps)));
  const sent = new Map<string, bigint>();
  included.slice(0, 2).forEach((r, i) => sent.set(r.wallet.toLowerCase(), dues[i]!));
  return { firstBuy: total, sent };
}
