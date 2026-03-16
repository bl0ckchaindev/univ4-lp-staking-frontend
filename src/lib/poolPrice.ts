/**
 * Pool price helpers: compute poolId/slot from poolKey, decode slot0, sqrtPriceX96 <-> price.
 * Used by Admin (on-chain price display) and Vault (linked ETH/USDC amounts).
 */
import { encodeAbiParameters, encodePacked, keccak256, padHex } from "viem";

export const ETH_DECIMALS_POOL = 18;
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
