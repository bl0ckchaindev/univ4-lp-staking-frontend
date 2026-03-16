import { useReadContract } from "wagmi";
import { useChainId } from "wagmi";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { formatUnits } from "viem";

const SHARE_DECIMALS = 18;

/** Compact format for stats: 1.23M, 4.56K */
function formatCompact(amount: bigint, decimals: number): string {
  const n = Number(formatUnits(amount, decimals));
  if (n === 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

/**
 * Lightweight vault stats for home page: TVL, share price, total supply.
 */
export function useVaultStats() {
  const chainId = useChainId();
  const { vault } = getContractAddresses(chainId);

  const { data: totalAssets } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalAssets",
  });

  const { data: totalSupply } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalSupply",
  });

  const totalAssetsBn = totalAssets ?? 0n;
  const totalSupplyBn = totalSupply ?? 0n;
  const sharePrice =
    totalSupplyBn > 0n && totalAssetsBn > 0n
      ? Number(totalAssetsBn) / Number(totalSupplyBn)
      : 0;

  const tvlFormatted =
    totalAssetsBn > 0n ? formatCompact(totalAssetsBn, SHARE_DECIMALS) : "—";
  const totalSupplyFormatted =
    totalSupplyBn > 0n ? formatCompact(totalSupplyBn, SHARE_DECIMALS) : "—";

  return {
    totalAssets: totalAssetsBn,
    totalSupply: totalSupplyBn,
    sharePrice,
    tvlFormatted,
    totalSupplyFormatted,
    hasVault: !!vault,
  };
}
