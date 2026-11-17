import { useCallback, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "../lib/chain";
import { humanizeError } from "../lib/errors";

export type WalletStatus = "disconnected" | "connected" | "wrong";

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { ethereum?: unknown }).ethereum !== "undefined";
}

export function useWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  const status: WalletStatus = !isConnected ? "disconnected" : chainId !== CHAIN_ID ? "wrong" : "connected";

  const connect = useCallback(async () => {
    setError(null);
    if (!hasInjectedWallet()) {
      setError("No browser wallet was found. Install MetaMask or another wallet extension, then reload this page.");
      return;
    }
    try {
      const c = connectors[0];
      if (!c) throw new Error("No wallet connector available.");
      await connectAsync({ connector: c, chainId: CHAIN_ID });
    } catch (e) {
      setError(humanizeError(e));
    }
  }, [connectors, connectAsync]);

  /** Switches the wallet to GIWA Sepolia. wagmi adds the chain (wallet_addEthereumChain) when the wallet does not know it. */
  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (e) {
      setError(humanizeError(e));
    }
  }, [switchChainAsync]);

  return { address, status, connect, connecting, switchNetwork, switching, disconnect, error, chainId, clearError: () => setError(null) };
}
