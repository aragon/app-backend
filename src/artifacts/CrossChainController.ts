export const CrossChainController = {
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'chainId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'localAdapter',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'remoteAdapter',
          type: 'address',
        },
      ],
      name: 'ConfigUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'oldExecutor',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'newExecutor',
          type: 'address',
        },
      ],
      name: 'ExecutorUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'oldMinFailedMessageGas',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newMinFailedMessageGas',
          type: 'uint256',
        },
      ],
      name: 'MinFailedMessageGasUpdated',
      type: 'event',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_destinationChainId',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_gasLimit',
          type: 'uint256',
        },
        {
          internalType: 'bytes',
          name: '_message',
          type: 'bytes',
        },
      ],
      name: 'forwardMessage',
      outputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
}
