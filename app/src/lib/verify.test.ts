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
  provenance: { state: "ok" },
  handles: { state: "ok" },
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
  it("mismatch: commit is not on the default branch (a fork's commit)", () => {
    expect(status({ ...good(), provenance: { state: "mismatch", detail: "fork" } })).toBe("mismatch");
  });
  it("mismatch: a listed handle is not a repository contributor", () => {
    expect(status({ ...good(), handles: { state: "mismatch", detail: "ghost is not a contributor" } })).toBe("mismatch");
  });
  it("unverifiable: provenance or handles could not be checked", () => {
    expect(status({ ...good(), provenance: { state: "unavailable", reason: "rate limit" } })).toBe("unverifiable");
    expect(status({ ...good(), handles: { state: "unavailable", reason: "network" } })).toBe("unverifiable");
  });
  it("a real mismatch wins over an unavailable check", () => {
    expect(status({ ...good(), creatorShareOfNonProtocolBps: 1, katki: { state: "unavailable", reason: "x" } })).toBe("mismatch");
  });
});

describe("single-recipient launches (no vault)", () => {
  const direct = (): VerifyInput => ({
    metaRecipient: R1,
    partnerRecipient: R1.toUpperCase().replace("0X", "0x"),
    creatorShareOfNonProtocolBps: 0,
    creator: C,
    expectedToken: W,
    vault: null,
    katki: { state: "ok", wallets: [R1] },
    provenance: { state: "ok" },
    handles: { state: "ok" },
  });
  it("verifies when the recipient, the file and the repository agree; vault checks are skipped", () => {
    expect(status(direct())).toBe("verified");
  });
  it("mismatch: the Config's fee recipient is not the named wallet", () => {
    expect(status({ ...direct(), partnerRecipient: R2 })).toBe("mismatch");
  });
  it("mismatch: the creator takes a fee share", () => {
    expect(status({ ...direct(), creatorShareOfNonProtocolBps: 1 })).toBe("mismatch");
  });
  it("mismatch: the file lists a different wallet, or more than this one", () => {
    expect(status({ ...direct(), katki: { state: "ok", wallets: [R2] } })).toBe("mismatch");
    expect(status({ ...direct(), katki: { state: "ok", wallets: [R1, R2] } })).toBe("mismatch");
  });
  it("mismatch: handle is not a repo contributor, or the commit is not on the default branch, or the file is missing", () => {
    expect(status({ ...direct(), handles: { state: "mismatch", detail: "x" } })).toBe("mismatch");
    expect(status({ ...direct(), provenance: { state: "mismatch", detail: "fork" } })).toBe("mismatch");
    expect(status({ ...direct(), katki: { state: "missing" } })).toBe("mismatch");
  });
  it("unverifiable, never verified, when GitHub cannot be reached", () => {
    expect(status({ ...direct(), katki: { state: "unavailable", reason: "x" } })).toBe("unverifiable");
  });
  it("mismatch: metadata names both a vault and a recipient, or neither", () => {
    expect(status({ ...direct(), metaVault: V })).toBe("mismatch");
    expect(status({ ...direct(), metaRecipient: undefined })).toBe("mismatch");
  });
  it("a vault is not required to be readable in direct mode, but a vault launch still needs one", () => {
    expect(status({ ...good(), vault: null })).toBe("unverifiable");
  });
});
