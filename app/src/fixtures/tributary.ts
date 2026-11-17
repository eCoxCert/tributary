/* FIXTURE_ONLY_DEV: fixed fake data for the launch page, loaded only by `vite dev` (never in the production bundle).
 * Open  #/launch/<token>?fixture=ok|mismatch|loading|error  and, for wallet states, &fw=me|owner|wrong|none.
 * The curve, price and quotes are the real EMP launch on GIWA Sepolia; the Tributary side (repo, vault, split,
 * allocation) is invented. */
import type { Address } from "viem";
import { readCurveSnapshot, type VaultSnapshot } from "../lib/launches";
import type { LaunchData, ContribFileInfo } from "../hooks/useLaunch";
import type { AllocationRead } from "../lib/allocation";
import { EXAMPLE_CONTRIBUTORS } from "../lib/examples";
import { selectVaultRecipients } from "../lib/split";
import { verifyLaunch } from "../lib/cardVerify";
import { rateLimitMessage } from "../lib/github";
import type { Card } from "../hooks/useChainData";
import type { DirectSnapshot } from "../lib/launches";
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
export const DIRECT_WALLET = included[0]!.wallet as Address; // the single contributor of the `direct` fixture

export async function fixtureLaunch(kind: string): Promise<LaunchData> {
  if (kind === "loading") return new Promise<LaunchData>(() => {});
  if (kind === "error") throw new Error("The GIWA Sepolia RPC timed out after 10 seconds (fixture).");
  const real = await readCurveSnapshot(FIXTURE_CURVE, FIXTURE_TOKEN);
  const good = kind !== "mismatch";
  const isDirect = kind === "direct";
  const partner = isDirect ? DIRECT_WALLET : FIXTURE_VAULT;
  if (kind === "info-wait") await new Promise(() => {});
  const snap = good
    ? { ...real, state: { ...real.state, creator: FIXTURE_OWNER, partnerRecipient: partner, feeVault: FEE_STORE }, config: { ...real.config, partnerRecipient: partner, creatorShareOfNonProtocolBps: 0 } }
    : real; // mismatch: the real config names someone else and gives the creator 30% of the fee
  return { token: FIXTURE_TOKEN, curve: FIXTURE_CURVE, snap, meta: isDirect ? { app: "tributary", repo: "proxycox/solo-tool", fileCommit: SHA, recipient: DIRECT_WALLET } : { app: "tributary", repo: "tidewater/quill-rpc", fileCommit: SHA, vault: FIXTURE_VAULT } };
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

export const fixtureInfoAsync = async (kind: string): Promise<ContribFileInfo> => {
  if (kind === "checking") return new Promise<ContribFileInfo>(() => {});
  return fixtureInfo(kind);
};

export function fixtureDirect(): DirectSnapshot {
  return { recipient: DIRECT_WALLET, feeVault: FEE_STORE, pending: 31_000_000_000_000_000n };
}

export const fixtureInfo = (kind: string): ContribFileInfo => (kind === "direct" ? fixtureDirectInfo : fixtureInfoBase(kind));

const fixtureDirectInfo: ContribFileInfo = {
  contribFile: { state: "ok", wallets: [DIRECT_WALLET] },
  provenance: { state: "ok" },
  handles: { state: "ok" },
  file: { version: 1, contributors: [{ github: "mira-k", wallet: DIRECT_WALLET }] },
  history: [{ login: "mira-k", contributions: 312 }],
  repo: { fullName: "proxycox/solo-tool", defaultBranch: "main", stars: 12, language: "TypeScript", isPrivate: false, htmlUrl: "https://github.com/proxycox/solo-tool" },
  notes: [],
};

const fixtureInfoBase = (kind: string): ContribFileInfo => ({
  contribFile: kind === "unverifiable" ? { state: "unavailable", reason: "rate limit" } : { state: "ok", wallets: EXAMPLE_CONTRIBUTORS.map((c) => c.wallet) },
  provenance: kind === "unverifiable" ? { state: "unavailable", reason: "rate limit" } : { state: "ok" },
  handles: kind === "unverifiable" ? { state: "unavailable", reason: "rate limit" } : { state: "ok" },
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

export function fixtureRecords(real: LaunchRecord[]): LaunchRecord[] {
  const names = ["tidewater/quill-rpc", "pinecrest/gas-oracle-rs", "lumen-rs/evm-trace", "marlow-io/eip712-forms"];
  return real.slice(0, 4).map((r, i) => ({ ...r, meta: { app: "tributary" as const, repo: names[i]!, fileCommit: SHA, vault: FIXTURE_VAULT } }));
}

/** Card for the list fixtures: quill-rpc and eip712-forms verified, gas-oracle-rs unverifiable (GitHub rate limit), evm-trace mismatch (hidden). */
export async function fixtureCard(rec: LaunchRecord, loading: boolean): Promise<Card> {
  if (loading) return new Promise<Card>(() => {});
  const real = await readCurveSnapshot(rec.curve, rec.token);
  const repo = rec.meta?.repo ?? "";
  const mismatch = repo === "lumen-rs/evm-trace";
  const snap = mismatch ? real : { ...real, state: { ...real.state, creator: FIXTURE_OWNER }, config: { ...real.config, partnerRecipient: FIXTURE_VAULT, creatorShareOfNonProtocolBps: 0 } };
  const unavailable = repo === "pinecrest/gas-oracle-rs";
  // token names match their repos; the unverifiable one carries a hostile name on purpose: it must never be shown as a repo
  const label: Record<string, [string, string]> = {
    "tidewater/quill-rpc": ["Quill", "QRPC"],
    "pinecrest/gas-oracle-rs": ["facebook/react", "GASR"],
    "lumen-rs/evm-trace": ["EVM Trace", "TRCE"],
    "marlow-io/eip712-forms": ["EIP-712 Forms", "SIGN"],
  };
  const [tokName, tokSym] = label[repo] ?? [snap.name, snap.symbol];
  const named = { ...snap, name: tokName, symbol: tokSym };
  const until = Date.now() + 22 * 60_000;
  if (unavailable) localStorage.setItem("trib:gh:limit", String(until)); // lets the listing show the "checks resume in N min" note
  const why = rateLimitMessage(until, Date.now());
  const verified = verifyLaunch({
    meta: rec.meta!,
    partnerRecipient: snap.config.partnerRecipient,
    creatorShareOfNonProtocolBps: snap.config.creatorShareOfNonProtocolBps,
    creator: snap.state.creator,
    quoteToken: WETH,
    vault: fixtureVault("ok"),
    contribFile: unavailable ? { state: "unavailable", reason: why } : { state: "ok", wallets: EXAMPLE_CONTRIBUTORS.map((c) => c.wallet) },
    provenance: unavailable ? { state: "unavailable", reason: why } : { state: "ok" },
    handles: unavailable ? { state: "unavailable", reason: why } : { state: "ok" },
  });
  return { rec, snap: named, vault: fixtureVault("ok"), direct: null, timestamp: Date.now() - 3_600_000 * (1 + (rec.block % 20n === 0n ? 1 : 5)), verified };
}

export function fixtureAllocation(kind = "ok"): AllocationRead {
  const total = 120_000_000_000_000_000n; // 120M tokens at 9 decimals
  if (kind === "direct") return { firstBuy: total, sent: new Map() };
  const dues = splitByShares(total, included.map((i) => BigInt(i.bps)));
  const sent = new Map<string, bigint>();
  included.slice(0, 2).forEach((r, i) => sent.set(r.wallet.toLowerCase(), dues[i]!));
  return { firstBuy: total, sent };
}
