import { useState, useEffect, useCallback } from "react";
import { useChainId } from "wagmi";
import { getPoolId } from "@/lib/poolPrice";
import { getSwapVolume, type SwapVolumeStats } from "@/lib/api";

type PoolKeyTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  number,
  number,
  `0x${string}`,
];

const EMPTY: SwapVolumeStats = {
  totalVolumeUsd: 0,
  totalFeesUsd: 0,
  totalFeesEth: 0,
  totalFeesUsdc: 0,
  volume24hUsd: 0,
  fees24hUsd: 0,
  apr: 0,
  swapCount: 0,
  firstSwapTs: 0,
  isLoading: true,
};

export type { SwapVolumeStats };

/**
 * Fetches swap volume stats from the backend (aggregated from stored swaps).
 * Backend must have VITE_API_URL and be syncing PoolManager Swap events.
 */
export function useSwapVolume(
  poolKey: PoolKeyTuple | undefined,
  ethPriceUsd: number | undefined,
  tvlUsd: number,
): SwapVolumeStats & { refetch: () => void } {
  const chainId = useChainId();
  const [stats, setStats] = useState<SwapVolumeStats>(EMPTY);

  const fetchStats = useCallback(async () => {
    if (!poolKey) {
      setStats((s) => ({ ...s, isLoading: false }));
      return;
    }
    try {
      const poolId = getPoolId(poolKey);
      const data = await getSwapVolume(poolId, chainId, ethPriceUsd, tvlUsd);
      setStats({ ...data, isLoading: false });
    } catch (err) {
      console.error("[useSwapVolume] Failed to fetch:", err);
      setStats((s) => ({ ...s, isLoading: false }));
    }
  }, [poolKey, chainId, ethPriceUsd, tvlUsd]);

  useEffect(() => {
    setStats((s) => ({ ...s, isLoading: true }));
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { ...stats, refetch: fetchStats };
}
