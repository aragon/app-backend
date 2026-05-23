// Minimal QuoterV2 ABI fragment used for read-only `eth_call` / `callStatic`
// price probes against any Uniswap V3 (or fork) deployment.
// Reference: https://docs.uniswap.org/contracts/v3/reference/periphery/lens/QuoterV2
export const UniswapV3QuoterV2 = {
  contractName: 'UniswapV3QuoterV2',
  abi: [
    {
      inputs: [
        {
          components: [
            { internalType: 'address', name: 'tokenIn', type: 'address' },
            { internalType: 'address', name: 'tokenOut', type: 'address' },
            { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
            { internalType: 'uint24', name: 'fee', type: 'uint24' },
            { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
          ],
          internalType: 'struct IQuoterV2.QuoteExactInputSingleParams',
          name: 'params',
          type: 'tuple',
        },
      ],
      name: 'quoteExactInputSingle',
      outputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
        { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
        { internalType: 'uint32', name: 'initializedTicksCrossed', type: 'uint32' },
        { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
} as const