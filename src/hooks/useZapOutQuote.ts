import { useReadContract } from "wagmi";
import { getContractAddresses } from "@/lib/contracts";
import { quoterAbi } from "@/lib/abis/quoter";

/** PoolKey as returned by vault.poolKey() - may be object or tuple. */
export type PoolKeyLike =
  | readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`]
  | { currency0: `0x${string}`; currency1: `0x${string}`; fee: number | bigint; tickSpacing: number | bigint; hooks: `0x${string}` };

function toPoolKeyTuple(pk: PoolKeyLike): readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`] {
  if (Array.isArray(pk)) return pk;
  const p = pk as { currency0: string; currency1: string; fee: number | bigint; tickSpacing: number | bigint; hooks: string };
  return [
    p.currency0 as `0x${string}`,
    p.currency1 as `0x${string}`,
    Number(p.fee),
    Number(p.tickSpacing),
    p.hooks as `0x${string}`,
  ];
}

export type ZapOutReceiveMode = "proportional" | "eth" | "usdc";

export type ZapOutQuoteResult = {
  /** Exact ETH received when receiveMode === 'eth' (previewEth + quoted ETH from swapping previewUsdc). */
  exactEthTotal: bigint | undefined;
  /** Exact USDC received when receiveMode === 'usdc' (previewUsdc + quoted USDC from swapping previewEth). */
  exactUsdcTotal: bigint | undefined;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Uses Uniswap v4 Quoter to get exact zap-out amounts for "ETH only" or "USDC only".
 * ETH only: swap preview USDC → ETH, exactEthTotal = previewEth + quoted ETH.
 * USDC only: swap preview ETH → USDC, exactUsdcTotal = previewUsdc + quoted USDC.
 */
export function useZapOutQuote(
  withdrawPreview: { previewEth: bigint; previewUsdc: bigint } | null,
  receiveMode: ZapOutReceiveMode,
  poolKey: PoolKeyLike | null | undefined,
  quoterAddress: `0x${string}` | undefined
): ZapOutQuoteResult {
  const poolKeyTuple =
    poolKey != null ? toPoolKeyTuple(poolKey) : null;

  const needQuote =
    receiveMode !== "proportional" &&
    withdrawPreview != null &&
    poolKeyTuple != null &&
    quoterAddress != null &&
    (receiveMode === "eth" ? withdrawPreview.previewUsdc > 0n : withdrawPreview.previewEth > 0n);

  const quoteArgs =
    needQuote && withdrawPreview && poolKeyTuple
      ? receiveMode === "eth"
        ? [poolKeyTuple, false, withdrawPreview.previewUsdc, "0x" as const] as const
        : ([poolKeyTuple, true, withdrawPreview.previewEth, "0x" as const] as const)
      : undefined;

  const { data: quoteData, isLoading, error } = useReadContract({
    address: quoterAddress,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: quoteArgs,
  });

  if (receiveMode === "proportional" || !withdrawPreview) {
    return { exactEthTotal: undefined, exactUsdcTotal: undefined, isLoading: false, error: null };
  }

  const amountOut = quoteData?.[0];
  if (receiveMode === "eth") {
    const exactEthTotal = amountOut != null ? withdrawPreview.previewEth + amountOut : undefined;
    return { exactEthTotal, exactUsdcTotal: undefined, isLoading: needQuote ? isLoading : false, error: error ?? null };
  }
  const exactUsdcTotal = amountOut != null ? withdrawPreview.previewUsdc + amountOut : undefined;
  return { exactEthTotal: undefined, exactUsdcTotal, isLoading: needQuote ? isLoading : false, error: error ?? null };
}

/** Same as vault totalAssets: amount0 (18d) + amount1 (6d) scaled to 18d. */
function toAssets18(amount0Wei: bigint, amount1Raw: bigint): bigint {
  return amount0Wei + amount1Raw * 10n ** 12n;
}

export type ZapInQuoteResult = {
  /** Estimated shares from pool quote (50% swapped); undefined when not zap or no quote. */
  estimatedShares: bigint | undefined;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Uses Uniswap v4 Quoter to get exact zap-in share estimate.
 * Quotes the 50% swap (ETH→USDC or USDC→ETH), then computes assets18 and shares from quoted amounts.
 */
export function useZapInQuote(
  zapToken: "ETH" | "USDC",
  inputAmount: bigint,
  poolKey: PoolKeyLike | null | undefined,
  quoterAddress: `0x${string}` | undefined,
  totalSupply: bigint,
  totalAssets: bigint
): ZapInQuoteResult {
  const poolKeyTuple = poolKey != null ? toPoolKeyTuple(poolKey) : null;
  const half = inputAmount / 2n;
  const needQuote =
    inputAmount > 0n &&
    poolKeyTuple != null &&
    quoterAddress != null &&
    (zapToken === "ETH" ? half > 0n : half > 0n);

  const quoteArgs = needQuote
    ? zapToken === "ETH"
      ? ([poolKeyTuple, true, half, "0x" as const] as const)
      : ([poolKeyTuple, false, half, "0x" as const] as const)
    : undefined;

  const { data: quoteData, isLoading, error } = useReadContract({
    address: quoterAddress,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: quoteArgs,
  });

  const amountOut = quoteData?.[0];
  if (!needQuote || amountOut == null) {
    return { estimatedShares: undefined, isLoading: needQuote ? isLoading : false, error: error ?? null };
  }

  const assets18 =
    zapToken === "ETH"
      ? toAssets18(half, amountOut)
      : toAssets18(amountOut, half);
  const estimatedShares =
    totalSupply === 0n ? assets18 : totalAssets === 0n ? 0n : (assets18 * totalSupply) / totalAssets;

  return { estimatedShares, isLoading: false, error: null };
}
