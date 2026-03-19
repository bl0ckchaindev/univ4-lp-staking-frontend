import { useChainId, useReadContract } from "wagmi";
import { getContractAddresses } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { poolManagerAbi } from "@/lib/abis/poolManager";
import {
  getPoolId,
  getSlot0StorageSlot,
  decodeSlot0,
  sqrtPriceX96ToPrice,
  ETH_DECIMALS_POOL,
  USDC_DECIMALS_POOL,
} from "@/lib/poolPrice";

export type PoolPriceResult = {
  price: number | undefined;
  sqrtPriceX96: bigint | undefined;
  refetch: () => void;
};

/**
 * Current pool price and sqrtPriceX96 from on-chain slot0.
 * Use price for display; use sqrtPriceX96 with tick range for concentrated liquidity amount math.
 * Call refetch() after swaps/deposits/redeems to update price immediately.
 */
export function usePoolPrice(): PoolPriceResult {
  const chainId = useChainId();
  const { vault, poolManager } = getContractAddresses(chainId);

  const { data: poolKey, refetch: refetchPoolKey } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "poolKey",
  });

  const poolKeyTuple = poolKey as
    | readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`]
    | undefined;
  const slot0StorageSlot =
    poolKeyTuple && poolManager ? getSlot0StorageSlot(getPoolId(poolKeyTuple)) : undefined;

  const { data: slot0Data, refetch: refetchSlot0 } = useReadContract({
    address: poolManager,
    abi: poolManagerAbi,
    functionName: "extsload",
    args: slot0StorageSlot ? [slot0StorageSlot] : undefined,
  });

  const refetch = () => {
    refetchPoolKey();
    refetchSlot0();
  };

  if (
    slot0Data == null ||
    slot0Data === "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return { price: undefined, sqrtPriceX96: undefined, refetch };
  }
  const { sqrtPriceX96 } = decodeSlot0(slot0Data as `0x${string}`);
  const price = sqrtPriceX96ToPrice(sqrtPriceX96, ETH_DECIMALS_POOL, USDC_DECIMALS_POOL);
  return { price, sqrtPriceX96, refetch };
}
