/**
 * Chainlink CCIP artifacts used by the cross-chain `_gasLimit` estimation endpoint.
 *
 * Only the fragments this service actually calls are declared.
 */

export const CCIPAdapter = {
  abi: [
    {
      type: 'function',
      name: 'CCIP_ROUTER',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
    {
      type: 'function',
      name: 'CROSS_CHAIN_CONTROLLER',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
    {
      type: 'function',
      name: 'toNativeChainId',
      stateMutability: 'view',
      inputs: [{ name: 'chainId', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'ccipReceive',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [
        {
          name: 'message',
          type: 'tuple',
          components: [
            { name: 'messageId', type: 'bytes32' },
            { name: 'sourceChainSelector', type: 'uint64' },
            { name: 'sender', type: 'bytes' },
            { name: 'data', type: 'bytes' },
            {
              name: 'destTokenAmounts',
              type: 'tuple[]',
              components: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
