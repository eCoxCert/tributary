/**
 * Sending transactions: every one is simulated first. A failed simulation never reaches the wallet.
 * - ABI-known calls (ERC-20, WETH) use simulateContract.
 * - SDK-built calldata uses eth_call from the same account (what simulateContract does underneath).
 */
import { erc20Abi, parseAbi, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { ADDR, giwaSepolia } from "./chain";

export type Tx = { to: Address; data: Hex; value?: bigint };

const wethAbi = parseAbi(["function deposit() payable", "function withdraw(uint256 wad)", "function balanceOf(address) view returns (uint256)"]);

async function finish(client: PublicClient, hash: Hex): Promise<TransactionReceipt> {
  const r = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (r.status !== "success") throw new Error("The transaction was mined but reverted on chain. Gas was spent; no funds moved.");
  return r;
}

export async function sendCalldata(wallet: WalletClient, client: PublicClient, account: Address, tx: Tx): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  await client.call({ account, to: tx.to, data: tx.data, value: tx.value }); // throws with the revert reason
  const hash = await wallet.sendTransaction({ account, chain: giwaSepolia, to: tx.to, data: tx.data, value: tx.value });
  return { hash, receipt: await finish(client, hash) };
}

export async function approveToken(wallet: WalletClient, client: PublicClient, account: Address, token: Address, spender: Address, amount: bigint) {
  const { request } = await client.simulateContract({ account, address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
  const hash = await wallet.writeContract(request);
  return finish(client, hash);
}

export async function transferToken(wallet: WalletClient, client: PublicClient, account: Address, token: Address, to: Address, amount: bigint) {
  const { request } = await client.simulateContract({ account, address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const hash = await wallet.writeContract(request);
  return { hash, receipt: await finish(client, hash) };
}

export async function wrapEth(wallet: WalletClient, client: PublicClient, account: Address, amount: bigint) {
  const { request } = await client.simulateContract({ account, address: ADDR.weth, abi: wethAbi, functionName: "deposit", value: amount });
  const hash = await wallet.writeContract(request);
  return finish(client, hash);
}

export async function unwrapEth(wallet: WalletClient, client: PublicClient, account: Address, amount: bigint) {
  const { request } = await client.simulateContract({ account, address: ADDR.weth, abi: wethAbi, functionName: "withdraw", args: [amount] });
  const hash = await wallet.writeContract(request);
  return finish(client, hash);
}

export async function wethBalance(client: PublicClient, who: Address): Promise<bigint> {
  return client.readContract({ address: ADDR.weth, abi: wethAbi, functionName: "balanceOf", args: [who] });
}
export async function tokenBalance(client: PublicClient, token: Address, who: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
}
export async function allowanceOf(client: PublicClient, token: Address, owner: Address, spender: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
}
