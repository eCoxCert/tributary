/**
 * Wallet-less simulation of the create calls from a random `from`: a 6-contributor repo (fee vault, top 5) and a
 * single-contributor repo (no vault, fees straight to the wallet). Read-only: eth_call and estimateGas only.
 *   npx tsx scripts/simulate-create.ts
 */
import { randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { buildCreatePlan, simulateCreate } from "../src/lib/create";
import { planRecipients } from "../src/lib/split";

const rnd = (): Address => getAddress(("0x" + randomBytes(20).toString("hex")) as Hex);
let failed = 0;

for (const [label, commits] of [["6 contributors", [120, 60, 15, 5, 3, 2]], ["1 contributor", [87]]] as const) {
  console.log(`\n=== ${label}`);
  const owner = rnd();
  const sel = planRecipients(commits.map((c, i) => ({ github: `user${i}`, wallet: rnd(), commits: c })));
  if (!sel.ok) throw new Error(sel.reason);
  console.log("owner (random, keyless):", owner, "| mode:", sel.mode);
  console.log("included:", sel.included.map((i) => `${i.github}=${i.bps}bps`).join(" "), "| excluded:", sel.excluded.map((e) => e.github).join(",") || "-");
  const plan = await buildCreatePlan({
    owner,
    repo: "tidewater/quill-rpc",
    fileCommit: "3f9a2c1d4e5b6a7988776655443322110ffeeddc",
    recipients: sel.included.map((i) => ({ wallet: i.wallet as Address, bps: i.bps })),
    name: "Quill",
    symbol: "QRPC",
  });
  console.log("vault:", plan.vault ? `${plan.vault.predicted} (ready=${plan.vault.ready})` : "none (direct)", "| Config partnerRecipient:", plan.config.partnerRecipient, "| creatorShare:", plan.config.creatorShareOfNonProtocolBps);
  if (plan.recipient && plan.config.partnerRecipient !== plan.recipient) throw new Error("partnerRecipient is not the recipient");
  const steps = await simulateCreate(plan, owner);
  for (const s of steps) console.log(s.ok ? "OK  " : "FAIL", s.id.padEnd(7), s.detail, s.gas ? `gas~${s.gas}` : "");
  failed += steps.filter((s) => !s.ok).length;
  console.log(`${steps.filter((s) => s.ok).length}/${steps.length} simulations succeeded. Nothing was sent.`);
}
if (failed) process.exitCode = 1;
