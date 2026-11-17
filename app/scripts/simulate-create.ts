/**
 * Wallet-less simulation of the three create calls (vault, config, launch) from a random `from`.
 * Read-only: eth_call and estimateGas only. No key, no transaction.
 *   npx tsx scripts/simulate-create.ts
 */
import { randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { buildCreatePlan, simulateCreate } from "../src/lib/create";
import { selectVaultRecipients } from "../src/lib/split";

const rnd = (): Address => getAddress(("0x" + randomBytes(20).toString("hex")) as Hex);
const owner = rnd();
const commits = [120, 60, 15, 5, 3, 2]; // six contributors: only the top five enter the vault
const sel = selectVaultRecipients(commits.map((c, i) => ({ github: `user${i}`, wallet: rnd(), commits: c })));
if (!sel.ok) throw new Error(sel.reason);
console.log("owner (random, keyless):", owner);
console.log("included:", sel.included.map((i) => `${i.github}=${i.bps}bps`).join(" "), "| excluded:", sel.excluded.map((e) => e.github).join(","));
const plan = await buildCreatePlan({
  owner,
  repo: "tidewater/quill-rpc",
  katkiCommit: "3f9a2c1d4e5b6a7988776655443322110ffeeddc",
  recipients: sel.included.map((i) => ({ wallet: i.wallet as Address, bps: i.bps })),
  name: "Quill",
  symbol: "QRPC",
});
console.log("predicted vault:", plan.vault.predicted, "existing:", plan.vault.existing, "ready:", plan.vault.ready, plan.vault.issues);
console.log("config: partner=", plan.config.partnerRecipient, "creatorShare=", plan.config.creatorShareOfNonProtocolBps, "feeBps=", plan.config.cliffFeeBps, "poolCreationFee=", plan.config.poolCreationFee);
console.log("metadataURI length:", plan.metadataURI.length);
const steps = await simulateCreate(plan, owner);
for (const s of steps) console.log(s.ok ? "OK  " : "FAIL", s.id.padEnd(7), s.detail, s.gas ? `gas~${s.gas}` : "");
const bad = steps.filter((s) => !s.ok).length;
console.log(`${steps.length - bad}/${steps.length} simulations succeeded. Nothing was sent.`);
