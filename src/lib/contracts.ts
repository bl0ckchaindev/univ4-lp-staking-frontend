/**
 * Contract addresses and chain config.
 * Uniswap v4 uses native ETH (no WETH). Set VITE_VAULT_ADDRESS, VITE_ZAP_ADDRESS in .env.
 */

import { base, baseSepolia, sepolia } from "viem/chains";

export const supportedChains = [base, baseSepolia, sepolia] as const;

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const,
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
};

// Uniswap v4 PoolManager per chain (for pool initialize). Set VITE_POOL_MANAGER_ADDRESS for other chains.
const POOL_MANAGER_BY_CHAIN: Partial<Record<number, string>> = {
  [sepolia.id]: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
};

export function getContractAddresses(chainId: number) {
  const vault = import.meta.env.VITE_VAULT_ADDRESS as string | undefined;
  const zap = import.meta.env.VITE_ZAP_ADDRESS as string | undefined;
  const poolManager = (import.meta.env.VITE_POOL_MANAGER_ADDRESS as string | undefined) || POOL_MANAGER_BY_CHAIN[chainId];
  const usdc = (import.meta.env.VITE_USDC_ADDRESS as string | undefined) || USDC_BY_CHAIN[chainId] || USDC_BY_CHAIN[sepolia.id];

  return {
    vault: vault?.startsWith("0x") ? (vault as `0x${string}`) : undefined,
    zap: zap?.startsWith("0x") ? (zap as `0x${string}`) : undefined,
    poolManager: poolManager?.startsWith("0x") ? (poolManager as `0x${string}`) : undefined,
    usdc: usdc as `0x${string}`,
  };
}

export function getDefaultChainId(): number {
  const id = import.meta.env.VITE_CHAIN_ID;
  if (id !== undefined && id !== "") return Number(id);
  return sepolia.id;
}
