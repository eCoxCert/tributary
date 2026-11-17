import { describe, expect, it } from "vitest";
import { checkAgainstHistory, missingFromFile, parseContribFile, templateFor } from "./contribFile";

const A = "0x8c1F0000000000000000000000000000000a4a2E".toLowerCase();
const B = "0x2b7D00000000000000000000000000000000e019".toLowerCase();
const file = (contributors: unknown, version: unknown = 1) => JSON.stringify({ version, contributors });

describe("parseContribFile", () => {
  it("accepts a valid file and checksums wallets", () => {
    const r = parseContribFile(file([{ github: "mira-k", wallet: A }, { github: "dvasquez", wallet: B }]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.contributors).toHaveLength(2);
      expect(r.file.contributors[0]?.wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
  it("rejects invalid JSON, wrong version, empty list", () => {
    expect(parseContribFile("{nope").ok).toBe(false);
    expect(parseContribFile(file([{ github: "a", wallet: A }], 2)).ok).toBe(false);
    expect(parseContribFile(file([])).ok).toBe(false);
    expect(parseContribFile("[]").ok).toBe(false);
  });
  it("rejects an invalid address", () => {
    const r = parseContribFile(file([{ github: "mira-k", wallet: "0x123" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe("bad-wallet");
  });
  it("rejects a bad checksum", () => {
    const bad = "0x8c1F0000000000000000000000000000000A4a2e"; // mixed case that is not the checksum
    const r = parseContribFile(file([{ github: "mira-k", wallet: bad }]));
    expect(r.ok).toBe(false);
  });
  it("rejects the zero address", () => {
    const r = parseContribFile(file([{ github: "mira-k", wallet: "0x" + "0".repeat(40) }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe("zero-wallet");
  });
  it("rejects a duplicate user, case-insensitively", () => {
    const r = parseContribFile(file([{ github: "Mira-K", wallet: A }, { github: "mira-k", wallet: B }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "duplicate-user")).toBe(true);
  });
  it("rejects two users sharing one wallet", () => {
    const r = parseContribFile(file([{ github: "a1", wallet: A }, { github: "b1", wallet: A }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "duplicate-wallet")).toBe(true);
  });
  it("rejects an invalid GitHub handle", () => {
    for (const bad of ["", "-bad", "bad-", "has space", "a".repeat(40), "x/y"]) {
      expect(parseContribFile(file([{ github: bad, wallet: A }])).ok).toBe(false);
    }
  });
  it("ignores a leftover weight with a warning", () => {
    const r = parseContribFile(file([{ github: "mira-k", wallet: A, weight: 0.5 }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings[0]?.code).toBe("weight-ignored");
  });
});

describe("checkAgainstHistory", () => {
  const parsed = parseContribFile(file([{ github: "mira-k", wallet: A }, { github: "dvasquez", wallet: B }]));
  if (!parsed.ok) throw new Error("fixture");
  it("joins commit counts case-insensitively", () => {
    const r = checkAgainstHistory(parsed.file, [{ login: "Mira-K", contributions: 120 }, { login: "dvasquez", contributions: 60 }, { login: "other", contributions: 3 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eligible.map((e) => e.commits)).toEqual([120, 60]);
  });
  it("fails for a user who is not a repo contributor", () => {
    const r = checkAgainstHistory(parsed.file, [{ login: "mira-k", contributions: 120 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.code).toBe("not-a-contributor");
  });
  it("lists repo contributors left out of the file", () => {
    const left = missingFromFile(parsed.file, [{ login: "mira-k", contributions: 1 }, { login: "zoe", contributions: 9 }]);
    expect(left.map((l) => l.login)).toEqual(["zoe"]);
  });
});

describe("placeholder wallets", () => {
  it("rejects the template placeholder with a replace-it message", () => {
    const r = parseContribFile(file([{ github: "mira-k", wallet: "0xYOUR_WALLET_ADDRESS" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]?.code).toBe("placeholder-wallet");
      expect(r.errors[0]?.message).toMatch(/Replace it with your wallet/);
    }
  });
});

describe("templateFor", () => {
  it("fills handles from history and leaves wallets empty", () => {
    const t = JSON.parse(templateFor([{ login: "a", contributions: 5 }, { login: "b", contributions: 2 }]));
    expect(t.version).toBe(1);
    expect(t.contributors).toEqual([{ github: "a", wallet: "0xYOUR_WALLET_ADDRESS" }, { github: "b", wallet: "0xYOUR_WALLET_ADDRESS" }]);
  });
});
