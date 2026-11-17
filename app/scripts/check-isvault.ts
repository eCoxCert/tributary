/** Reads DFS factory isVault() for a real vault (found from AFSVaultCreated events) and for a random address. Read-only. */
import { randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { ammoraAFSFactoryAbi } from "@ammora-protocol/sdk";
import { ADDR, publicClient as c } from "../src/lib/chain";
import { scanRanges, splitRangesNewestFirst } from "../src/lib/logs";

const ev = (ammoraAFSFactoryAbi as readonly { type: string; name?: string }[]).find((x) => x.type === "event" && x.name === "AFSVaultCreated");
const head = await c.getBlockNumber();
const LOOK = 300_000n;
let found: { vault: Address; block: bigint } | undefined;
for (let off = 0n; off < 1_200_000n && !found; off += LOOK) {
  const hi = head - off;
  const lo = hi - LOOK + 1n;
  const logs = await scanRanges(splitRangesNewestFirst(lo, hi), (r) => c.getLogs({ address: ADDR.dfsFactory, event: ev as never, fromBlock: r.from, toBlock: r.to }));
  const l = (logs as unknown as { args: { vault: Address }; blockNumber: bigint }[]).sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))[0];
  if (l) found = { vault: l.args.vault, block: l.blockNumber };
  else console.log(`no AFSVaultCreated in blocks ${lo}..${hi}`);
}
const isVault = (a: Address) => c.readContract({ address: ADDR.dfsFactory, abi: ammoraAFSFactoryAbi, functionName: "isVault", args: [a] });
if (!found) console.log("doğrulanamadı: no vault creation event found in the scanned 1.2M blocks");
else console.log(`real vault ${found.vault} (created at block ${found.block}): isVault =`, await isVault(found.vault));
const rnd = getAddress(("0x" + randomBytes(20).toString("hex")) as Hex);
console.log(`random address ${rnd}: isVault =`, await isVault(rnd));
