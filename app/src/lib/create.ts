/**
 * Launch creation: fee vault (DFS) -> Config -> launch (+ optional first buy), planned and simulated with eth_call.
 *
 * Chief decisions applied here:
 *  - vault owner = the wallet that opens the launch (no platform wallet);
 *  - Config partner recipient = the vault, creator share 0 (all non-protocol fees go to the vault);
 *  - the vault holds WETH only, so the Config collects fees in the quote token;
 *  - `metadataURI` carries { app, repo, katkiCommit, vault }.
 */
import { encodePacked, keccak256, type Address, type Hex, type PublicClient } from "viem";
import {
  DFSFactoryClient,
  buildRegisterConfigAndCreateAmmoraV4Launch,
  planCreateAmmoraV4Config,
  type AmmoraV4Config,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";
import { ADDR, dfsOptions, publicClient } from "./chain";
import { encodeTributaryMetadata } from "./metadata";
import { readTemplateConfig } from "./launches";
import { humanizeError } from "./errors";

export type CreateInput = {
  owner: Address;
  repo: string;
  katkiCommit: string;
  recipients: { wallet: Address; bps: number }[];
  name: string;
  symbol: string;
};

export type Tx = { to: Address; data: Hex; value?: bigint };

export type CreatePlan = {
  input: CreateInput;
  vault: {
    predicted: Address;
    existing: Address | null;
    salt: Hex;
    ready: boolean;
    issues: string[];
    tx: Tx;
  };
  config: AmmoraV4Config;
  segments: readonly AmmoraV4Segment[];
  metadataURI: string;
  launchTx: Tx;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/** The salt depends on everything that defines the split, so the same inputs always give the same vault (re-runs resume). */
export function vaultSalt(input: CreateInput): Hex {
  const parts = input.recipients.map((r) => `${r.wallet.toLowerCase()}:${r.bps}`).join(",");
  return keccak256(encodePacked(["string"], [`tributary/${input.repo.toLowerCase()}/${input.katkiCommit}/${input.owner.toLowerCase()}/${parts}`]));
}

export async function buildCreatePlan(input: CreateInput, client: PublicClient = publicClient): Promise<CreatePlan> {
  const tpl = await readTemplateConfig(client);
  if (!tpl) throw new Error("The template launch configuration could not be read from the GIWA Sepolia config registry, so the launch cannot be built. Try again in a moment.");
  if (!tpl.enabled) throw new Error("The template launch configuration is disabled in the config registry.");
  const dfs = new DFSFactoryClient(client, ADDR.dfsFactory, dfsOptions);
  const salt = vaultSalt(input);
  const pre = await dfs.getVaultCreationPreflight({
    owner: input.owner,
    token: ADDR.weth,
    base: ADDR.weth,
    recipients: input.recipients.map((r) => ({ recipient: r.wallet, share: BigInt(r.bps) })),
    userSalt: salt,
  });
  const vault = pre.predictedVault;
  const t = tpl.config;
  const config: AmmoraV4Config = {
    ...t,
    partnerRecipient: vault,
    creatorShareOfNonProtocolBps: 0,
    leftoverReceiver: input.owner,
    postMigrationCollectFeeMode: 1, // quote token only: the vault pays out WETH
    liquidityDistribution: {
      ...t.liquidityDistribution,
      partner: input.owner,
      partnerUnlockedBps: 0,
      partnerPermanentLockedBps: 10_000,
      creatorPermanentLockedBps: 0,
    },
  };
  const metadataURI = encodeTributaryMetadata({ repo: input.repo, katkiCommit: input.katkiCommit, vault });
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
    vault: {
      predicted: vault,
      existing: pre.existingVault && pre.existingVault !== ZERO ? (pre.existingVault as Address) : null,
      salt,
      ready: pre.ready || (!!pre.existingVault && pre.existingVault !== ZERO),
      issues: pre.issues,
      tx: { to: pre.transaction.to, data: pre.transaction.data },
    },
    config,
    segments: tpl.segments,
    metadataURI,
    launchTx: { to: ADDR.factory, data: reg.data, value: reg.value },
  };
}

export type SimStep = { id: "vault" | "config" | "launch"; label: string; ok: boolean; detail: string; gas?: bigint };

/** eth_call of the three on-chain steps from `from`. Nothing is sent. */
export async function simulateCreate(plan: CreatePlan, from: Address, client: PublicClient = publicClient): Promise<SimStep[]> {
  const out: SimStep[] = [];
  // 1. fee vault
  if (plan.vault.existing) {
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
    out.push({ id: "launch", label: "Create the token and its curve", ok: true, detail: "Simulated: config registration and token creation in one call.", gas });
  } catch (e) {
    out.push({ id: "launch", label: "Create the token and its curve", ok: false, detail: humanizeError(e) });
  }
  return out;
}
