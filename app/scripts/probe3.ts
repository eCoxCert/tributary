import { randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { createConfigAndPoolWithFirstBuy } from "@ammora-protocol/sdk";
import { buildCreatePlan } from "../src/lib/create";
import { publicClient } from "../src/lib/chain";
import { selectVaultRecipients } from "../src/lib/split";

const rnd = (): Address => getAddress(("0x" + randomBytes(20).toString("hex")) as Hex);
const owner = rnd();
const sel = selectVaultRecipients([120, 60, 15].map((c, i) => ({ github: `u${i}`, wallet: rnd(), commits: c })));
if (!sel.ok) throw new Error("x");
const plan = await buildCreatePlan({ owner, repo: "a/b", katkiCommit: "abcdef1", recipients: sel.included.map((i) => ({ wallet: i.wallet as Address, bps: i.bps })), name: "T", symbol: "TT" }, publicClient);
const head = await publicClient.getBlockNumber();
try {
  const r = await createConfigAndPoolWithFirstBuy(publicClient, {
    account: owner,
    config: plan.config,
    segments: plan.segments,
    launch: { name: "T", symbol: "TT", metadataURI: plan.metadataURI, creatorMetadataURI: plan.metadataURI, tokenDecimals: plan.config.tokenDecimals },
    firstBuys: [{ includedQuoteAmountRaw: 10n ** 15n, minimumBaseAmountOutRaw: 1n, allowPartialFill: false, recipient: owner }],
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    gas: { maxFeePerGasNativeRaw: 2_000_000_000n, safetyMarginBps: 2000n },
    blockNumber: head,
  });
  console.log("status", r.status);
} catch (e) {
  console.log("ERR", (e as Error).message.slice(0, 500));
}
