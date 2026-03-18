/**
 * Minimal PositionManager ABI for reading position liquidity (Uniswap v4 periphery).
 */
export const positionManagerAbi = [
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getPositionLiquidity",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
