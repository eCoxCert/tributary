import { describe, expect, it } from "vitest";
import { verifyLaunch } from "./cardVerify";
import { readKatkiState } from "./katkiCheck";
import type { Deps } from "./github";
import type { VaultSnapshot } from "./launches";

const A = (c: string) => ("0x" + c.repeat(40)) as `0x${string}`;
const meta = { app: "tributary" as const, repo: "o/r", katkiCommit: "abcdef1", vault: A("a") };
const vault = (over: Partial<VaultSnapshot> = {}): VaultSnapshot => ({
  vault: A("a"), owner: A("b"), token: A("4"), base: A("4"), fromFactory: true,
  recipients: [{ index: 0, recipient: A("1"), share: 6000n, claimed: 0n, claimable: 0n }, { index: 1, recipient: A("2"), share: 4000n, claimed: 0n, claimable: 0n }],
  totalShare: 10000n, totalFunded: 0n, totalClaimed: 0n, pendingInFeeVault: 0n, feeVault: A("9"), claimSourceEnabled: true, ...over,
});
const base = { meta, partnerRecipient: A("a"), creatorShareOfNonProtocolBps: 0, creator: A("b"), quoteToken: A("4") };
const ok = { state: "ok" as const, wallets: [A("1"), A("2")] };
const fine = { provenance: { state: "ok" as const }, handles: { state: "ok" as const } };

describe("card verification", () => {
  it("verifies a consistent card", () => {
    expect(verifyLaunch({ ...base, vault: vault(), katki: ok, ...fine }).status).toBe("verified");
  });
  it("a card whose vault wallets are not in .katki.json is a mismatch", () => {
    expect(verifyLaunch({ ...base, vault: vault(), katki: { state: "ok", wallets: [A("1")] }, ...fine }).status).toBe("mismatch");
  });
  it("a card whose vault is not from the factory is a mismatch", () => {
    expect(verifyLaunch({ ...base, vault: vault({ fromFactory: false }), katki: ok, ...fine }).status).toBe("mismatch");
  });
  it("a card whose vault pays another token is a mismatch", () => {
    expect(verifyLaunch({ ...base, vault: vault({ token: A("7") }), katki: ok, ...fine }).status).toBe("mismatch");
  });
  it("a card is unverifiable (not verified) while GitHub cannot be reached", () => {
    expect(verifyLaunch({ ...base, vault: vault(), katki: { state: "unavailable", reason: "network" }, ...fine }).status).toBe("unverifiable");
  });
});

function res(status: number, body = "") {
  return new Response(body, { status });
}
const deps = (f: () => Promise<Response>): Deps => ({ fetch: f, storage: null, now: () => 0 });
const file = JSON.stringify({ version: 1, contributors: [{ github: "a1", wallet: A("1") }] });

describe("readKatkiState", () => {
  it("404 is missing", async () => expect((await readKatkiState("o/r", "abcdef1", deps(async () => res(404)))).state.state).toBe("missing"));
  it("invalid file is invalid", async () => expect((await readKatkiState("o/r", "abcdef1", deps(async () => res(200, "{nope")))).state.state).toBe("invalid"));
  it("a valid file gives its wallets", async () => {
    const r = await readKatkiState("o/r", "abcdef1", deps(async () => res(200, file)));
    expect(r.state.state === "ok" && r.state.wallets.length).toBe(1);
  });
  it("network failure and HTTP 429/500 are unavailable, never missing", async () => {
    expect((await readKatkiState("o/r", "abcdef1", deps(async () => { throw new Error("offline"); }))).state.state).toBe("unavailable");
    expect((await readKatkiState("o/r", "abcdef1", deps(async () => res(429)))).state.state).toBe("unavailable");
    expect((await readKatkiState("o/r", "abcdef1", deps(async () => res(500)))).state.state).toBe("unavailable");
  });
});
