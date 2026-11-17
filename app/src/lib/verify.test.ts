import { describe, expect, it } from "vitest";
import { verifyTributaryLaunch, type VerifyInput } from "./verify";

const V = "0x" + "a".repeat(40);
const C = "0x" + "b".repeat(40);
const R1 = "0x" + "1".repeat(40);
const R2 = "0x" + "2".repeat(40);
const good = (): VerifyInput => ({
  metaVault: V,
  partnerRecipient: V.toUpperCase().replace("0X", "0x"),
  creatorShareOfNonProtocolBps: 0,
  creator: C,
  vault: { owner: C, recipients: [{ recipient: R1, share: 6000n }, { recipient: R2, share: 4000n }] },
  listedWallets: [R1, R2],
});

describe("verifyTributaryLaunch", () => {
  it("accepts a launch the chain agrees with (addresses compared case-insensitively)", () => {
    expect(verifyTributaryLaunch(good()).ok).toBe(true);
  });
  it("rejects a partner recipient that is not the metadata vault", () => {
    expect(verifyTributaryLaunch({ ...good(), partnerRecipient: "0x" + "c".repeat(40) }).ok).toBe(false);
  });
  it("rejects a creator fee share", () => {
    expect(verifyTributaryLaunch({ ...good(), creatorShareOfNonProtocolBps: 3000 }).ok).toBe(false);
  });
  it("rejects a vault owned by someone else", () => {
    const g = good();
    expect(verifyTributaryLaunch({ ...g, vault: { ...g.vault!, owner: R1 } }).ok).toBe(false);
  });
  it("rejects an unreadable vault", () => {
    expect(verifyTributaryLaunch({ ...good(), vault: null }).ok).toBe(false);
  });
  it("rejects recipients missing from .katki.json, but only when the file is known", () => {
    expect(verifyTributaryLaunch({ ...good(), listedWallets: [R1] }).ok).toBe(false);
    expect(verifyTributaryLaunch({ ...good(), listedWallets: null }).ok).toBe(true);
  });
  it("rejects a vault with one recipient", () => {
    const g = good();
    expect(verifyTributaryLaunch({ ...g, vault: { ...g.vault!, recipients: [{ recipient: R1, share: 10000n }] } }).ok).toBe(false);
  });
});
