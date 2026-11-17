import { describe, expect, it } from "vitest";
import type { AmmoraV4Config } from "@ammora-protocol/sdk";
import { assembleLaunch, composeConfig, vaultSalt } from "./create";
import { decodeTributaryMetadata } from "./metadata";

const OWNER = "0x" + "b".repeat(40);
const VAULT = "0x" + "a".repeat(40);
const TPL = {
  partnerRecipient: "0x" + "d".repeat(40),
  creatorShareOfNonProtocolBps: 3000,
  leftoverReceiver: "0x" + "d".repeat(40),
  postMigrationCollectFeeMode: 0,
  tokenDecimals: 9,
  liquidityDistribution: { partner: "0x" + "d".repeat(40), partnerUnlockedBps: 0, partnerPermanentLockedBps: 6250, creatorPermanentLockedBps: 3750, partnerVesting: {}, creatorVesting: {} },
} as unknown as AmmoraV4Config;

describe("launch config", () => {
  it("sends the whole non-protocol fee to the vault", () => {
    const c = composeConfig(TPL, OWNER as `0x${string}`, VAULT as `0x${string}`);
    expect(c.partnerRecipient).toBe(VAULT);
    expect(c.creatorShareOfNonProtocolBps).toBe(0);
    expect(c.postMigrationCollectFeeMode).toBe(1);
    expect(c.leftoverReceiver).toBe(OWNER);
    expect(c.liquidityDistribution.partner).toBe(OWNER);
    expect(c.liquidityDistribution.creatorPermanentLockedBps).toBe(0);
  });
  it("names the Config's fee recipient in the metadata", () => {
    const { config, metadataURI } = assembleLaunch({ owner: OWNER as `0x${string}`, repo: "o/r", katkiCommit: "abcdef1" }, TPL, VAULT as `0x${string}`);
    expect(decodeTributaryMetadata(metadataURI)?.vault.toLowerCase()).toBe(config.partnerRecipient.toLowerCase());
  });
  it("derives one vault salt per exact split", () => {
    const base = { owner: OWNER as `0x${string}`, repo: "o/r", katkiCommit: "abcdef1", name: "N", symbol: "NN" };
    const a = vaultSalt({ ...base, recipients: [{ wallet: VAULT as `0x${string}`, bps: 6000 }, { wallet: OWNER as `0x${string}`, bps: 4000 }] });
    const b = vaultSalt({ ...base, recipients: [{ wallet: VAULT as `0x${string}`, bps: 5000 }, { wallet: OWNER as `0x${string}`, bps: 5000 }] });
    expect(a).not.toBe(b);
  });
});
