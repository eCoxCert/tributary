/**
 * Launch creation: fee vault (DFS) -> Config -> launch (+ optional first buy), planned and simulated with eth_call.
 *
 * Chief decisions applied here:
 *  - vault owner = the wallet that opens the launch (no platform wallet);
 *  - Config partner recipient = the vault, creator share 0 (all non-protocol fees go to the vault);
 *  - the vault holds WETH only, so the Config collects fees in the quote token;
 *  - `metadataURI` carries { app, repo, fileCommit, vault }.
 */
import { encodePacked, keccak256, type Address, type Hex, type PublicClient } from "viem";
import {
  DFSFactoryClient,
  buildRegisterConfigAndCreateAmmoraV4Launch,
  createConfigAndPoolWithFirstBuy,
  planCreateAmmoraV4Config,
  type AmmoraV4Config,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";
import { ADDR, dfsOptions, publicClient } from "./chain";
import { encodeTributaryMetadata } from "./metadata";
import { readTemplateConfig } from "./launches";
import { humanizeError } from "./errors";
import { estimateFirstBuy } from "./curveMath";

export type CreateInput = {
  owner: Address;
  repo: string;
  fileCommit: string;
  recipients: { wallet: Address; bps: number }[];
  name: string;
  symbol: string;
};

export type Tx = { to: Address; data: Hex; value?: bigint };

export type CreateMode = "direct" | "vault";
/** One recipient: fees go straight to that wallet, no vault. Two to five: a fee vault. */
export const createMode = (recipients: readonly unknown[]): CreateMode => (recipients.length === 1 ? "direct" : "vault");

/** Ids of the transactions the flow sends, in order. No vault steps for a single recipient. */
export function createStepIds(mode: CreateMode, firstBuy: boolean): string[] {
  return [...(mode === "vault" ? ["vault", "source"] : []), ...(firstBuy ? ["wrap", "approve"] : []), "launch"];
}

export type CreatePlan = {
  input: CreateInput;
  mode: CreateMode;
  /** Set when fees go straight to one wallet. */
  recipient: Address | null;
  /** null for a single recipient: no vault is created. */
  vault: {
    predicted: Address;
    existing: Address | null;
    salt: Hex;
    ready: boolean;
    issues: string[];
    tx: Tx;
  } | null;
  config: AmmoraV4Config;
  segments: readonly AmmoraV4Segment[];
  metadataURI: string;
  launchTx: Tx;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/** The salt depends on everything that defines the split, so the same inputs always give the same vault (re-runs resume). */
export function vaultSalt(input: CreateInput): Hex {
  const parts = input.recipients.map((r) => `${r.wallet.toLowerCase()}:${r.bps}`).join(",");
  return keccak256(encodePacked(["string"], [`tributary/${input.repo.toLowerCase()}/${input.fileCommit}/${input.owner.toLowerCase()}/${parts}`]));
}

/** Template Config with Tributary's overrides. Pure, so it can be tested without a chain. */
export function composeConfig(t: AmmoraV4Config, owner: Address, feeRecipient: Address): AmmoraV4Config {
  return {
    ...t,
    partnerRecipient: feeRecipient, // the vault, or the single contributor's wallet
    creatorShareOfNonProtocolBps: 0,
    leftoverReceiver: owner,
    postMigrationCollectFeeMode: 1, // quote token only: the vault pays out WETH
    liquidityDistribution: { ...t.liquidityDistribution, partner: owner, partnerUnlockedBps: 0, partnerPermanentLockedBps: 10_000, creatorPermanentLockedBps: 0 },
  };
}

/** Config and metadata for one launch; the vault named in the metadata is the Config's fee recipient. */
export function assembleLaunch(input: Pick<CreateInput, "owner" | "repo" | "fileCommit">, template: AmmoraV4Config, target: { vault: Address } | { recipient: Address }) {
  const feeRecipient = "vault" in target ? target.vault : target.recipient;
  const meta = "vault" in target ? { vault: target.vault } : { recipient: target.recipient };
  return { config: composeConfig(template, input.owner, feeRecipient), metadataURI: encodeTributaryMetadata({ repo: input.repo, fileCommit: input.fileCommit, ...meta } as Parameters<typeof encodeTributaryMetadata>[0]) };
}

export async function buildCreatePlan(input: CreateInput, client: PublicClient = publicClient): Promise<CreatePlan> {
  const tpl = await readTemplateConfig(client);
  if (!tpl) throw new Error("The template launch configuration could not be read from the GIWA Sepolia config registry, so the launch cannot be built. Try again in a moment.");
  if (!tpl.enabled) throw new Error("The template launch configuration is disabled in the config registry.");
  const mode = createMode(input.recipients);
  let vaultInfo: CreatePlan["vault"] = null;
  let target: { vault: Address } | { recipient: Address };
  if (mode === "direct") {
    target = { recipient: (input.recipients[0] as { wallet: Address }).wallet };
  } else {
    const dfs = new DFSFactoryClient(client, ADDR.dfsFactory, dfsOptions);
    const salt = vaultSalt(input);
    const pre = await dfs.getVaultCreationPreflight({
      owner: input.owner,
      token: ADDR.weth,
      base: ADDR.weth,
      recipients: input.recipients.map((r) => ({ recipient: r.wallet, share: BigInt(r.bps) })),
      userSalt: salt,
    });
    target = { vault: pre.predictedVault };
    vaultInfo = {
      predicted: pre.predictedVault,
      existing: pre.existingVault && pre.existingVault !== ZERO ? (pre.existingVault as Address) : null,
      salt,
      ready: pre.ready || (!!pre.existingVault && pre.existingVault !== ZERO),
      issues: pre.issues,
      tx: { to: pre.transaction.to, data: pre.transaction.data },
    };
  }
  const { config, metadataURI } = assembleLaunch(input, tpl.config, target);
  const reg = buildRegisterConfigAndCreateAmmoraV4Launch(config, tpl.segments, {
    name: input.name,
    symbol: input.symbol,
    metadataURI,
    creatorMetadataURI: metadataURI,
    tokenDecimals: config.tokenDecimals,
    callback: ZERO,
    callbackData: "0x",
  });
  return {
    input,
    mode,
    recipient: "recipient" in target ? target.recipient : null,
    vault: vaultInfo,
    config,
    segments: tpl.segments,
    metadataURI,
    launchTx: { to: ADDR.factory, data: reg.data, value: reg.value },
  };
}

export type SimStep = { id: "vault" | "config" | "launch" | "firstbuy"; label: string; ok: boolean; detail: string; gas?: bigint };

/** eth_call of the three on-chain steps from `from`. Nothing is sent. */
export async function simulateCreate(plan: CreatePlan, from: Address, client: PublicClient = publicClient, firstBuyWei = 0n): Promise<SimStep[]> {
  const out: SimStep[] = [];
  // 1. fee vault
  if (!plan.vault) {
    /* single recipient: no vault, nothing to create */
  } else if (plan.vault.existing) {
    out.push({ id: "vault", label: "Create the fee vault", ok: true, detail: `A vault with these exact recipients already exists at ${plan.vault.existing}; it will be reused.` });
  } else if (!plan.vault.ready) {
    out.push({ id: "vault", label: "Create the fee vault", ok: false, detail: plan.vault.issues.join(" ") || "The vault factory reported the vault is not ready." });
  } else {
    try {
      await client.call({ account: from, to: plan.vault.tx.to, data: plan.vault.tx.data });
      const gas = await client.estimateGas({ account: from, to: plan.vault.tx.to, data: plan.vault.tx.data }).catch(() => undefined);
      out.push({ id: "vault", label: "Create the fee vault", ok: true, detail: `Simulated. Predicted vault ${plan.vault.predicted}.`, gas });
    } catch (e) {
      out.push({ id: "vault", label: "Create the fee vault", ok: false, detail: humanizeError(e) });
    }
  }
  // 2. config
  try {
    const p = await planCreateAmmoraV4Config(client, ADDR.registry, plan.config, plan.segments, from, from);
    const gas = await client.estimateGas({ account: from, to: p.transaction.to, data: p.transaction.data }).catch(() => undefined);
    out.push({ id: "config", label: "Register the launch configuration", ok: true, detail: `Simulated. Config id ${p.simulatedConfigId} (expected ${p.expectedConfigId}).`, gas });
  } catch (e) {
    out.push({ id: "config", label: "Register the launch configuration", ok: false, detail: humanizeError(e) });
  }
  // 3. launch (registers the config and creates the token in one call)
  try {
    await client.call({ account: from, to: plan.launchTx.to, data: plan.launchTx.data, value: plan.launchTx.value });
    const gas = await client.estimateGas({ account: from, to: plan.launchTx.to, data: plan.launchTx.data, value: plan.launchTx.value }).catch(() => undefined);
    out.push({ id: "launch", label: firstBuyWei > 0n ? "Create the token and its curve (simulated without the first buy)" : "Create the token and its curve", ok: true, detail: "Simulated: config registration and token creation in one call.", gas });
  } catch (e) {
    out.push({ id: "launch", label: "Create the token and its curve", ok: false, detail: humanizeError(e) });
  }
  if (firstBuyWei > 0n) out.push(await simulateFirstBuy(plan, from, firstBuyWei, client));
  return out;
}

/** The transaction actually sent when the owner buys at launch. It needs WETH, so it is simulated for real only when the wallet already has it. */
export async function simulateFirstBuy(plan: CreatePlan, from: Address, amount: bigint, client: PublicClient = publicClient): Promise<SimStep> {
  const label = "Create the token and make the first buy (the transaction that is sent)";
  try {
    const minOut = (estimateFirstBuy(plan.segments, amount, plan.config.cliffFeeBps) * 99n) / 100n;
    const p = await createConfigAndPoolWithFirstBuy(client, {
      account: from,
      config: plan.config,
      segments: plan.segments,
      launch: { name: plan.input.name, symbol: plan.input.symbol, metadataURI: plan.metadataURI, creatorMetadataURI: plan.metadataURI, tokenDecimals: plan.config.tokenDecimals },
      firstBuys: [{ includedQuoteAmountRaw: amount, minimumBaseAmountOutRaw: minOut, allowPartialFill: false, recipient: from }],
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      gas: { maxFeePerGasNativeRaw: (await client.getGasPrice()) * 2n, safetyMarginBps: 2000n },
      blockNumber: await client.getBlockNumber(),
    });
    if (p.status === "APPROVAL_REQUIRED") return { id: "firstbuy", label, ok: true, detail: "This wallet has the WETH but has not approved it yet. The approval comes first, then this call is simulated again before it is sent." };
    await client.call({ account: from, to: p.transaction.to, data: p.transaction.data, value: p.transaction.value });
    return { id: "firstbuy", label, ok: true, detail: "Simulated with your WETH balance and allowance." };
  } catch (e) {
    const m = (e as Error).message ?? "";
    if (/Quote balance is below/i.test(m)) return { id: "firstbuy", label, ok: true, detail: "Not simulated yet: this wallet holds less WETH than the first buy. The app wraps ETH first, then simulates this call right before it is sent. If that simulation fails, nothing is sent." };
    return { id: "firstbuy", label, ok: false, detail: humanizeError(e) };
  }
}

