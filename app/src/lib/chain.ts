import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { giwaSepoliaAutoRouteDeployment as DEP, createAmmoraDeploymentSource } from "@ammora-protocol/sdk";

export const deployment = DEP;
export const CHAIN_ID = DEP.chain.id; // 91342
export const RPC_URL = DEP.chain.rpcUrls[0];
export const EXPLORER = DEP.chain.blockExplorerUrl;

export const giwaSepolia = defineChain({
  id: DEP.chain.id,
  name: DEP.chain.name,
  nativeCurrency: DEP.chain.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GIWA Sepolia Explorer", url: EXPLORER } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const ADDR = {
  factory: DEP.contracts.launch.factory as Address,
  registry: DEP.contracts.launch.configRegistry as Address,
  feePolicy: DEP.contracts.launch.feePolicy as Address,
  weth: DEP.contracts.tokens.wrappedNative as Address,
  dfsFactory: DEP.contracts.feeSharing.factory as Address,
} as const;

export const core = { launchFactory: ADDR.factory, feePolicy: ADDR.feePolicy } as const;

/** The DFS client defaults to the legacy fee-sharing factory; the auto-route deployment must be named explicitly. */
export const dfsOptions = { deploymentSource: createAmmoraDeploymentSource([DEP]) };

/**
 * Template Config. Every Tributary Config is a copy of this one with the fee recipient replaced.
 * It is read from the registry at run time; nothing about it is hard-coded in the UI.
 * Override with ?template=<id> for debugging.
 */
export const TEMPLATE_CONFIG_ID = 30n;

/** Data API base (may be down; the scan falls back to chain logs). */
export const DATA_API = "https://ammora-giwa-sepolia-data.fly.dev";

export const publicClient: PublicClient = createPublicClient({
  chain: giwaSepolia,
  batch: { multicall: { wait: 24 } },
  transport: http(RPC_URL, { timeout: 10_000, retryCount: 4, retryDelay: 400 }),
}) as PublicClient;

export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;
