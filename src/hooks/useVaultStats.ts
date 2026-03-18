import { useReadContract } from "wagmi";
import { useChainId } from "wagmi";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { positionManagerAbi } from "@/lib/abis/positionManager";
import { formatUnits } from "viem";
import { usePoolPrice } from "@/hooks/usePoolPrice";
import { getAmountsForLiquidity } from "@/lib/poolPrice";

const SHARE_DECIMALS = 18;

/** Compact format for bigint: 1.23M, 4.56K */
function formatCompact(amount: bigint, decimals: number): string {
  const n = Number(formatUnits(amount, decimals));
  if (n === 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

/** Compact format for USD: $1.23M, $4.56K */
function formatCompactUSD(usd: number): string {
  if (usd === 0 || !Number.isFinite(usd)) return "$0";
  if (usd >= 1e9) return "$" + (usd / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (usd >= 1e6) return "$" + (usd / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (usd >= 1e3) return "$" + (usd / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  if (usd >= 1) return "$" + usd.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return "$" + usd.toFixed(2);
}

/**
 * Lightweight vault stats for home page: TVL (USD), share price (USD), total supply.
 */
export function useVaultStats() {
  const chainId = useChainId();
  const { vault } = getContractAddresses(chainId);
  const { price: poolPriceNum, sqrtPriceX96 } = usePoolPrice();

  const { data: totalSupply } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "totalSupply",
  });
  const { data: idle0 } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "idle0",
  });
  const { data: idle1 } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "idle1",
  });
  const { data: tickLower } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "tickLower",
  });
  const { data: tickUpper } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "tickUpper",
  });
  const { data: positionManagerAddress } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionManager",
  });
  const { data: positionTokenId } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "positionTokenId",
  });

  const { data: positionLiquidity } = useReadContract({
    address: (positionManagerAddress as `0x${string}` | undefined) ?? undefined,
    abi: positionManagerAbi,
    functionName: "getPositionLiquidity",
    args: positionTokenId != null && positionTokenId > 0n ? [positionTokenId] : undefined,
  });

  const tickLowerNum = tickLower != null ? Number(tickLower) : null;
  const tickUpperNum = tickUpper != null ? Number(tickUpper) : null;
  const [positionEth, positionUsdc] =
    sqrtPriceX96 != null &&
    sqrtPriceX96 > 0n &&
    tickLowerNum != null &&
    tickUpperNum != null &&
    tickLowerNum < tickUpperNum &&
    positionLiquidity != null
      ? getAmountsForLiquidity(sqrtPriceX96, tickLowerNum, tickUpperNum, positionLiquidity)
      : [0n, 0n];

  const totalEth = (idle0 ?? 0n) + positionEth;
  const totalUsdc = (idle1 ?? 0n) + positionUsdc;
  const totalSupplyBn = totalSupply ?? 0n;

  const totalValueUSD =
    poolPriceNum != null && poolPriceNum > 0
      ? Number(totalEth) / 1e18 * poolPriceNum + Number(totalUsdc) / 1e6
      : 0;

  const sharePrice =
    totalSupplyBn > 0n && totalValueUSD > 0
      ? totalValueUSD / (Number(totalSupplyBn) / 1e18)
      : 0;

  const tvlFormatted = totalValueUSD > 0 ? formatCompactUSD(totalValueUSD) : "—";
  const totalSupplyFormatted =
    totalSupplyBn > 0n ? formatCompact(totalSupplyBn, SHARE_DECIMALS) : "—";

  return {
    totalAssets: totalEth + totalUsdc * 10n ** 12n,
    totalSupply: totalSupplyBn,
    sharePrice,
    tvlFormatted,
    totalSupplyFormatted,
    hasVault: !!vault,
  };
}
