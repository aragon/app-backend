// Minimal Router02 ABI fragment for view-only price probes against any
// Uniswap V2 (or fork) deployment. Quotes via `getAmountsOut` are pure view;
// no state mutation.
// Reference: https://docs.uniswap.org/contracts/v2/reference/smart-contracts/router-02#getamountsout
export const UniswapV2Router = {
  contractName: 'UniswapV2Router',
  abi: [
    {
      inputs: [
        { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
        { internalType: 'address[]', name: 'path', type: 'address[]' },
      ],
      name: 'getAmountsOut',
      outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
} as const