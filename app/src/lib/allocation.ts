/**
 * Contributor allocation (chief decision 1): the launch owner buys at launch (atomic first buy, recipient = owner),
 * then sends those tokens to the fee recipients by commit share with plain ERC-20 transfers.
 * Nothing on chain forces the owner to do this; the site reads Transfer events to show what actually happened.
 */
import { parseAbiItem, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { ammoraLaunchPoolV4Abi } from "@ammora-protocol/sdk";
import { publicClient } from "./chain";
import { scanRanges, splitRangesNewestFirst } from "./logs";
import { TOTAL_BPS } from "./split";

/** Splits `total` by integer weights. Each part is floored; the remainder goes to the largest weight (first on a tie). */
export function splitByShares(total: bigint, shares: readonly bigint[]): bigint[] {
  const sum = shares.reduce((a, b) => a + b, 0n);
  if (sum <= 0n || shares.some((s) => s <= 0n)) throw new Error("Every share must be positive.");
  const parts = shares.map((s) => (total * s) / sum);
  let largest = 0;
  for (let i = 1; i < shares.length; i++) if ((shares[i] as bigint) > (shares[largest] as bigint)) largest = i;
  const rest = total - parts.reduce((a, b) => a + b, 0n);
  parts[largest] = (parts[largest] as bigint) + rest;
  return parts;
}

/** Same, for basis points that must add up to 10000. */
export function splitAllocation(total: bigint, bps: readonly number[]): bigint[] {
  if (bps.reduce((a, b) => a + b, 0) !== TOTAL_BPS) throw new Error("Shares must add up to 10000 basis points.");
  return splitByShares(total, bps.map((b) => BigInt(b)));
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type AllocationRead = {
  /** Tokens the owner bought in the launch transaction. 0n when there was no first buy. */
  firstBuy: bigint;
  /** Sum of ERC-20 transfers owner -> address since launch, keyed by lowercase address. */
  sent: Map<string, bigint>;
  /** True when the scan did not reach back to the launch block (very old launch). */
  truncated: boolean;
};

export async function readAllocation(p: { token: Address; curve: Address; creator: Address; txHash: Hex; block: bigint }, client: PublicClient = publicClient): Promise<AllocationRead> {
  const receipt = await client.getTransactionReceipt({ hash: p.txHash });
  const swaps = parseEventLogs({ abi: ammoraLaunchPoolV4Abi, eventName: "Swap", logs: receipt.logs.filter((l) => l.address.toLowerCase() === p.curve.toLowerCase()) });
  let firstBuy = 0n;
  for (const s of swaps) {
    const a = s.args as { baseForQuote: boolean; amountOut: bigint; recipient: Address };
    if (!a.baseForQuote && a.recipient.toLowerCase() === p.creator.toLowerCase()) firstBuy += a.amountOut;
  }
  const head = await client.getBlockNumber();
  const MAX = 400_000n;
  const from = head - p.block > MAX ? head - MAX : p.block;
  const logs = await scanRanges(
    splitRangesNewestFirst(from, head),
    (r) => client.getLogs({ address: p.token, event: transferEvent, args: { from: p.creator }, fromBlock: r.from, toBlock: r.to }),
  );
  const sent = new Map<string, bigint>();
  for (const l of logs) {
    const to = (l.args.to as Address).toLowerCase();
    sent.set(to, (sent.get(to) ?? 0n) + (l.args.value as bigint));
  }
  return { firstBuy, sent, truncated: from > p.block };
}
