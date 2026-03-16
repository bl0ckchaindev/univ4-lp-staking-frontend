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

/**
 * Current pool price (USDC per 1 ETH) from on-chain slot0.
 * Returns undefined if vault/pool not configured or pool not initialized.
 */
export function usePoolPrice(): number | undefined {
  const chainId = useChainId();
  const { vault, poolManager } = getContractAddresses(chainId);

  const { data: poolKey } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "poolKey",
  });

  const poolKeyTuple = poolKey as
    | readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`]
    | undefined;
  const slot0StorageSlot =
    poolKeyTuple && poolManager ? getSlot0StorageSlot(getPoolId(poolKeyTuple)) : undefined;

  const { data: slot0Data } = useReadContract({
    address: poolManager,
    abi: poolManagerAbi,
    functionName: "extsload",
    args: slot0StorageSlot ? [slot0StorageSlot] : undefined,
  });

  if (
    slot0Data == null ||
    slot0Data === "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    return undefined;
  }
  const { sqrtPriceX96 } = decodeSlot0(slot0Data as `0x${string}`);
  return sqrtPriceX96ToPrice(sqrtPriceX96, ETH_DECIMALS_POOL, USDC_DECIMALS_POOL);
}
