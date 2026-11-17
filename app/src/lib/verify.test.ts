import { describe, expect, it } from "vitest";
import { isVerified, verifyTributaryLaunch, type VerifyInput } from "./verify";

const V = "0x" + "a".repeat(40);
const C = "0x" + "b".repeat(40);
const R1 = "0x" + "1".repeat(40);
const R2 = "0x" + "2".repeat(40);
const W = "0x" + "4".repeat(40);
const good = (): VerifyInput => ({
  metaVault: V,
  partnerRecipient: V.toUpperCase().replace("0X", "0x"),
  creatorShareOfNonProtocolBps: 0,
  creator: C,
  expectedToken: W,
  vault: { owner: C, token: W, base: W, fromFactory: true, recipients: [{ recipient: R1, share: 6000n }, { recipient: R2, share: 4000n }] },
  katki: { state: "ok", wallets: [R1, R2] },
});
const status = (i: VerifyInput) => verifyTributaryLaunch(i).status;

describe("verifyTributaryLaunch", () => {
  it("verifies when chain and repository agree (addresses compared case-insensitively)", () => {
    expect(status(good())).toBe("verified");
    expect(isVerified(verifyTributaryLaunch(good()))).toBe(true);
  });
  it("mismatch: partner recipient is not the metadata vault", () => {
    expect(status({ ...good(), partnerRecipient: "0x" + "c".repeat(40) })).toBe("mismatch");
  });
  it("mismatch: creator takes a fee share", () => {
    expect(status({ ...good(), creatorShareOfNonProtocolBps: 3000 })).toBe("mismatch");
  });
  it("mismatch: vault owned by someone else", () => {
    const g = good();
    expect(status({ ...g, vault: { ...g.vault!, owner: R1 } })).toBe("mismatch");
  });
  it("mismatch: vault with one recipient", () => {
    const g = good();
    expect(status({ ...g, vault: { ...g.vault!, recipients: [{ recipient: R1, share: 10000n }] } })).toBe("mismatch");
  });
  it("mismatch: vault pays out a different token or base", () => {
    const g = good();
    expect(status({ ...g, vault: { ...g.vault!, token: R1 } })).toBe("mismatch");
    expect(status({ ...g, vault: { ...g.vault!, base: R1 } })).toBe("mismatch");
  });
  it("mismatch: vault not made by the factory", () => {
    const g = good();
    expect(status({ ...g, vault: { ...g.vault!, fromFactory: false } })).toBe("mismatch");
  });
  it("unverifiable (not verified): factory record unreadable", () => {
    const g = good();
    expect(status({ ...g, vault: { ...g.vault!, fromFactory: null } })).toBe("unverifiable");
  });
  it("mismatch: .katki.json missing or invalid at the commit", () => {
    expect(status({ ...good(), katki: { state: "missing" } })).toBe("mismatch");
    expect(status({ ...good(), katki: { state: "invalid" } })).toBe("mismatch");
  });
  it("mismatch: recipient not listed in .katki.json", () => {
    expect(status({ ...good(), katki: { state: "ok", wallets: [R1] } })).toBe("mismatch");
  });
  it("unverifiable, never verified: GitHub unavailable or vault unreadable", () => {
    expect(status({ ...good(), katki: { state: "unavailable", reason: "rate limit" } })).toBe("unverifiable");
    expect(status({ ...good(), vault: null })).toBe("unverifiable");
  });
  it("a real mismatch wins over an unavailable check", () => {
    expect(status({ ...good(), creatorShareOfNonProtocolBps: 1, katki: { state: "unavailable", reason: "x" } })).toBe("mismatch");
  });
});
