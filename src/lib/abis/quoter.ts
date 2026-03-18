/**
 * Uniswap v4 V4Quoter ABI for quoteExactInputSingle (exact-in swap quote).
 * Used for zap-out "ETH only" / "USDC only" exact receive amounts.
 */
export const quoterAbi = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "currency0",
            type: "address",
          },
          {
            internalType: "address",
            name: "currency1",
            type: "address",
          },
          {
            internalType: "uint24",
            name: "fee",
            type: "uint24",
          },
          {
            internalType: "int24",
            name: "tickSpacing",
            type: "int24",
          },
          {
            internalType: "address",
            name: "hooks",
            type: "address",
          },
        ],
        internalType: "struct PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      {
        internalType: "bool",
        name: "zeroForOne",
        type: "bool",
      },
      {
        internalType: "uint128",
        name: "exactAmount",
        type: "uint128",
      },
      {
        internalType: "bytes",
        name: "hookData",
        type: "bytes",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
