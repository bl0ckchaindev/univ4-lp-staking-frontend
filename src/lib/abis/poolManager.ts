/**
 * Minimal PoolManager ABI for initializing a pool and reading slot0 (Uniswap v4).
 * PoolKey: { currency0, currency1, fee, tickSpacing, hooks }
 */
export const poolManagerAbi = [
  {
    inputs: [{ internalType: "bytes32", name: "slot", type: "bytes32" }],
    name: "extsload",
    outputs: [{ internalType: "bytes32", name: "value", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "currency0", type: "address" },
          { internalType: "address", name: "currency1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "address", name: "hooks", type: "address" },
        ],
        internalType: "struct PoolKey",
        name: "key",
        type: "tuple",
      },
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
    ],
    name: "initialize",
    outputs: [{ internalType: "int24", name: "tick", type: "int24" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
