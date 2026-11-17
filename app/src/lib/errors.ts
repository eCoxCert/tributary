/**
 * Turns RPC, wallet and contract failures into sentences that say what happened and what it means for funds.
 */
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, UserRejectedRequestError, type Abi, type Hex } from "viem";
import { ammoraContractErrorAbi, ammoraLaunchPoolV4Abi, ammoraLaunchFactoryV4Abi } from "@ammora-protocol/sdk";

const KNOWN: Record<string, string> = {
  PriceOutsideCurve: "The trade would move the price outside the curve. For a sell this usually means you are selling more than the curve has sold, so it cannot pay that out.",
  SlippageExceeded: "The price moved more than your slippage setting allows. Try again, or raise slippage.",
  DeadlineExpired: "The transaction took too long to confirm and its deadline passed. Nothing was spent except gas, if any.",
  TradingInactive: "Trading is not active on this launch right now (it has not started or it already graduated).",
  MigrationNotReady: "The curve has not reached its graduation threshold yet.",
  PartialFillRequired: "This buy would cross the graduation threshold, so only part of it can fill. Reduce the amount.",
  AmountTooLarge: "That amount is larger than the curve can take in one trade. Reduce it.",
  ZeroAmount: "The amount is zero.",
  InvalidAmount: "The amount is not valid for this action.",
  Unauthorized: "This wallet is not allowed to do that.",
  NothingToClaim: "There is nothing to claim yet.",
  InvalidConfiguration: "The launch configuration was rejected by the protocol.",
  InvalidRecipient: "One of the recipient addresses was rejected.",
  UnsupportedToken: "The protocol does not support this token for that action.",
  TransferFailed: "A token transfer failed.",
  TransferFromFailed: "A token transfer failed. Check that the token approval and your balance cover the amount.",
  InexactTransfer: "The token moved a different amount than requested. It may charge a transfer fee.",
};

const abis: Abi[] = [ammoraContractErrorAbi as Abi, ammoraLaunchPoolV4Abi as Abi, ammoraLaunchFactoryV4Abi as Abi];

export function decodeRevert(data: Hex | undefined): { name: string; message: string } | null {
  if (!data || data === "0x") return null;
  for (const abi of abis) {
    try {
      const d = decodeErrorResult({ abi, data });
      return { name: d.errorName, message: KNOWN[d.errorName] ?? `The contract rejected the call (${d.errorName}).` };
    } catch {
      /* try next ABI */
    }
  }
  return null;
}

function revertData(e: unknown): Hex | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const w = e.walk((x) => typeof (x as { data?: unknown }).data === "string" && /^0x[0-9a-f]{8,}/i.test((x as { data: string }).data));
  const d = (w as { data?: Hex } | null)?.data;
  if (d) return d;
  const raw = e.walk((x) => typeof (x as { raw?: unknown }).raw === "string");
  return (raw as { raw?: Hex } | null)?.raw;
}

export function humanizeError(e: unknown): string {
  if (e instanceof Error && e.name === "AbortError") return "Cancelled.";
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError) || /user (rejected|denied)/i.test(e.message) || (e as { code?: number }).code === 4001) {
      return "You rejected the request in your wallet. Nothing was sent.";
    }
    const data = revertData(e);
    const decoded = decodeRevert(data);
    if (decoded) return `${decoded.message} Nothing was sent.`;
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (rev?.reason) return `The contract reverted: ${rev.reason}. Nothing was sent.`;
    const msg = e.shortMessage ?? e.message;
    if (/insufficient funds|exceeds the balance/i.test(msg) || /insufficient funds/i.test(e.details ?? "")) {
      return "This wallet does not have enough GIWA Sepolia ETH to pay for the amount and gas. Nothing was sent.";
    }
    if (/over rate limit|429|rate limit/i.test(`${msg} ${e.details ?? ""}`)) {
      return "The GIWA Sepolia RPC is rate limiting requests. Wait a few seconds and try again. Your funds are not affected; nothing was sent.";
    }
    if (/timed out|timeout/i.test(msg)) {
      return "The GIWA Sepolia RPC timed out after 10 seconds. Your funds are not affected; nothing was sent.";
    }
    if (/execution reverted/i.test(`${msg} ${e.details ?? ""}`)) {
      return "The simulation reverted and the contract gave no reason, so the transaction was not sent. Your funds are not affected.";
    }
    if (/fetch failed|failed to fetch|network/i.test(msg)) {
      return "The GIWA Sepolia RPC could not be reached. Your funds are not affected; nothing was sent.";
    }
    return `${msg.split("\n")[0]} Nothing was sent.`;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong. Nothing was sent.";
}
