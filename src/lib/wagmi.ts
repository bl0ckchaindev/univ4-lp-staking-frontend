import { createConfig, http } from "wagmi";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";
import { supportedChains } from "./contracts";

const defaultRpc: Record<number, string> = {
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org",
  11155111: "https://rpc.sepolia.org",
};

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

const connectors = [
  injected(),
  ...(projectId ? [walletConnect({ projectId })] : []),
  coinbaseWallet({ appName: "AquaVault" }),
];

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors,
  transports: {
    [supportedChains[0].id]: http(
      (import.meta.env.VITE_RPC_URL as string) || defaultRpc[supportedChains[0].id]
    ),
    [supportedChains[1].id]: http(
      (import.meta.env.VITE_RPC_URL as string) || defaultRpc[supportedChains[1].id]
    ),
    [supportedChains[2].id]: http(
      (import.meta.env.VITE_RPC_URL as string) || defaultRpc[supportedChains[2].id]
    ),
  },
});
