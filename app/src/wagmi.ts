import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { giwaSepolia, RPC_URL } from "./lib/chain";

/** Injected wallets only (MetaMask and friends). No WalletConnect, no remote relay. */
export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors: [injected()],
  transports: { [giwaSepolia.id]: http(RPC_URL, { timeout: 10_000 }) },
  multiInjectedProviderDiscovery: true,
});
