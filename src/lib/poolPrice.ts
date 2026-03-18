/**
 * Pool price helpers: compute poolId/slot from poolKey, decode slot0, sqrtPriceX96 <-> price.
 * Used by Admin (on-chain price display) and Vault (linked ETH/USDC amounts).
 */
import { encodeAbiParameters, encodePacked, keccak256, padHex } from "viem";

export const ETH_DECIMALS_POOL = 18;
/** USDC token decimals (6 on all chains). Do not use 18 for USDC. */
export const USDC_DECIMALS_POOL = 6;

/**
 * Compute PoolId from poolKey (keccak256(abi.encode(poolKey)) per v4 PoolIdLibrary).
 */
export function getPoolId(
  poolKey: readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`]
): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address", name: "currency0" },
      { type: "address", name: "currency1" },
      { type: "uint24", name: "fee" },
      { type: "int24", name: "tickSpacing" },
      { type: "address", name: "hooks" },
    ],
    [poolKey[0], poolKey[1], poolKey[2], poolKey[3], poolKey[4]]
  );
  return keccak256(encoded as `0x${string}`);
}

/**
 * Compute storage slot for pool's slot0 in PoolManager (StateLibrary._getPoolStateSlot).
 */
export function getSlot0StorageSlot(poolId: `0x${string}`): `0x${string}` {
  const packed = encodePacked(
    ["bytes32", "bytes32"],
    [poolId, padHex("0x06", { size: 32 })]
  );
  return keccak256(packed);
}

/**
 * Decode slot0 bytes32 from PoolManager: sqrtPriceX96 (160 bits), tick (24 bits signed).
 */
export function decodeSlot0(data: `0x${string}`): { sqrtPriceX96: bigint; tick: number } {
  const big = BigInt(data);
  const sqrtPriceX96 = big & ((1n << 160n) - 1n);
  let tick = Number((big >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;
  return { sqrtPriceX96, tick };
}

/**
 * Convert sqrtPriceX96 to human price (USDC per 1 ETH).
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const Q96 = 2n ** 96n;
  const scale = 10n ** 24n;
  const rawPriceScaled = (sqrtPriceX96 * sqrtPriceX96 * scale) / (Q96 * Q96);
  const rawPrice = Number(rawPriceScaled) / Number(scale);
  const pow = decimals0 - decimals1;
  const factor = pow >= 0 ? 10 ** pow : 1 / 10 ** -pow;
  return rawPrice * factor;
}

/** log10(1.0001) for tick-to-price */
const LOG10_1_0001 = Math.log10(1.0001);

/**
 * Human price (USDC per 1 ETH) at a given tick. Uses same convention as sqrtPriceX96ToPrice (price = token1/token0 in human).
 */
export function getPriceAtTick(
  tick: number,
  decimals0: number,
  decimals1: number
): number {
  const pow = decimals0 - decimals1;
  const factor = pow >= 0 ? 10 ** pow : 1 / 10 ** -pow;
  const rawPrice = 10 ** (tick * LOG10_1_0001);
  return rawPrice * factor;
}

/** Integer square root (floor). */
function isqrt(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (n / x + x) / 2n;
  }
  return x;
}

/**
 * Convert human price (USDC per 1 ETH) to sqrtPriceX96 for PoolManager.initialize.
 * Inverse of sqrtPriceX96ToPrice.
 */
export function priceToSqrtPriceX96(
  priceHuman: number,
  decimals0: number,
  decimals1: number
): bigint {
  if (priceHuman <= 0 || !Number.isFinite(priceHuman)) return 0n;
  const Q96 = 2n ** 96n;
  // (sqrtPriceX96/Q96)^2 = priceHuman * 10^(decimals1-decimals0) => sqrtPriceX96^2 = priceHuman * 10^(dec1-dec0) * Q96^2
  const pow = decimals1 - decimals0; // e.g. 6-18 = -12
  const scale = 10 ** 18;
  const scaledPrice = BigInt(Math.floor(priceHuman * scale));
  const factorDen = 10 ** -pow; // 10^12
  const sqrtPriceSq = (scaledPrice * Q96 * Q96) / BigInt(scale * factorDen);
  const sqrtPriceX96 = isqrt(sqrtPriceSq);
  return sqrtPriceX96 > 0xffffffffffffffffffffffffffffffffffffffffn
    ? 0xffffffffffffffffffffffffffffffffffffffffn
    : sqrtPriceX96;
}

const Q96 = 2n ** 96n;

/**
 * Get sqrtPriceX96 at tick (Uniswap v4 TickMath: sqrt(1.0001^tick) * 2^96).
 */
export function getSqrtPriceAtTick(tick: number): bigint {
  const rawPrice = Math.pow(1.0001, tick);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0n;
  const scale = 1e24;
  const rawPriceScaled = BigInt(Math.floor(rawPrice * scale));
  const sqrtPriceSq = (rawPriceScaled * Q96 * Q96) / BigInt(scale);
  const sqrtPriceX96 = isqrt(sqrtPriceSq);
  return sqrtPriceX96 > 0xffffffffffffffffffffffffffffffffffffffffn
    ? 0xffffffffffffffffffffffffffffffffffffffffn
    : sqrtPriceX96;
}

/**
 * Liquidity from amount0 (Uniswap LiquidityAmounts.getLiquidityForAmount0).
 * L = amount0 * (sqrtA * sqrtB / Q96) / (sqrtB - sqrtA). Requires sqrtA < sqrtB.
 */
function getLiquidityForAmount0(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  amount0: bigint
): bigint {
  let sa = sqrtPriceAX96;
  let sb = sqrtPriceBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sb === sa) return 0n;
  const intermediate = (sa * sb) / Q96;
  return (amount0 * intermediate) / (sb - sa);
}

/**
 * Amount1 for liquidity in range (Uniswap LiquidityAmounts.getAmount1ForLiquidity).
 * amount1 = L * (sqrtB - sqrtA) / Q96. Requires sqrtA < sqrtB.
 */
function getAmount1ForLiquidity(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint
): bigint {
  let sa = sqrtPriceAX96;
  let sb = sqrtPriceBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  return (liquidity * (sb - sa)) / Q96;
}

/**
 * Liquidity from amount1 (Uniswap LiquidityAmounts.getLiquidityForAmount1).
 * L = amount1 * Q96 / (sqrtB - sqrtA). Requires sqrtA < sqrtB.
 */
function getLiquidityForAmount1(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  amount1: bigint
): bigint {
  let sa = sqrtPriceAX96;
  let sb = sqrtPriceBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sb === sa) return 0n;
  return (amount1 * Q96) / (sb - sa);
}

/**
 * Amount0 for liquidity in range (Uniswap LiquidityAmounts.getAmount0ForLiquidity).
 * amount0 = L * Q96 * (sqrtB - sqrtA) / (sqrtB * sqrtA). Requires sqrtA < sqrtB.
 */
function getAmount0ForLiquidity(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint
): bigint {
  let sa = sqrtPriceAX96;
  let sb = sqrtPriceBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sa === 0n) return 0n;
  return ((liquidity * Q96 * (sb - sa)) / sb) / sa;
}

/**
 * Token amounts (amount0, amount1) for a position with given liquidity at current price.
 * Matches vault _getAmountsForLiquidity: price below range => only token0, above range => only token1, in range => both.
 * amount0 = token0 (e.g. ETH 18d), amount1 = token1 (e.g. USDC 6d).
 */
export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint
): [bigint, bigint] {
  if (liquidity === 0n) return [0n, 0n];
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);
  let sa = sqrtA;
  let sb = sqrtB;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sqrtPriceX96 <= sa) {
    return [getAmount0ForLiquidity(sa, sb, liquidity), 0n];
  }
  if (sqrtPriceX96 >= sb) {
    return [0n, getAmount1ForLiquidity(sa, sb, liquidity)];
  }
  return [
    getAmount0ForLiquidity(sqrtPriceX96, sb, liquidity),
    getAmount1ForLiquidity(sa, sqrtPriceX96, liquidity),
  ];
}

/**
 * Required amount1 (token1) for concentrated liquidity when user supplies amount0 (token0).
 * Matches Uniswap UI: uses current pool price and vault tick range.
 * Returns raw amount1 (e.g. USDC 6 decimals). Returns 0n if price outside range or invalid.
 */
export function getAmount1ForAmount0(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0Raw: bigint
): bigint {
  if (amount0Raw === 0n || sqrtPriceX96 <= 0n) return 0n;
  const sqrtPriceALow = getSqrtPriceAtTick(tickLower);
  const sqrtPriceBHigh = getSqrtPriceAtTick(tickUpper);
  if (sqrtPriceALow >= sqrtPriceBHigh) return 0n;
  if (sqrtPriceX96 <= sqrtPriceALow) return 0n; // only token0 needed
  if (sqrtPriceX96 >= sqrtPriceBHigh) return 0n; // only token1 needed, cannot derive from amount0
  const liquidity = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBHigh, amount0Raw);
  return getAmount1ForLiquidity(sqrtPriceALow, sqrtPriceX96, liquidity);
}

/**
 * Required amount0 (token0) for concentrated liquidity when user supplies amount1 (token1).
 * Inverse of getAmount1ForAmount0. Returns raw amount0 (e.g. ETH 18 decimals).
 */
export function getAmount0ForAmount1(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount1Raw: bigint
): bigint {
  if (amount1Raw === 0n || sqrtPriceX96 <= 0n) return 0n;
  const sqrtPriceALow = getSqrtPriceAtTick(tickLower);
  const sqrtPriceBHigh = getSqrtPriceAtTick(tickUpper);
  if (sqrtPriceALow >= sqrtPriceBHigh) return 0n;
  if (sqrtPriceX96 <= sqrtPriceALow) return 0n; // only token0 in range, cannot derive from amount1
  if (sqrtPriceX96 >= sqrtPriceBHigh) return 0n; // only token1 needed
  const liquidity = getLiquidityForAmount1(sqrtPriceALow, sqrtPriceX96, amount1Raw);
  return getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceBHigh, liquidity);
}
