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
    // `chainToAdapter` is a public mapping to a two-field struct, which Solidity exposes as a
    // getter returning the two fields separately - hence two outputs rather than a tuple.
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'chainId',
          type: 'uint256',
        },
      ],
      name: 'chainToAdapter',
      outputs: [
        {
          internalType: 'address',
          name: 'localAdapter',
          type: 'address',
        },
        {
          internalType: 'address',
          name: 'remoteAdapter',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'minFailedMessageGas',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'executor',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'uint256', name: 'originChainId', type: 'uint256' },
        { indexed: true, internalType: 'uint256', name: 'messageId', type: 'uint256' },
        { indexed: true, internalType: 'bytes32', name: 'txId', type: 'bytes32' },
        { indexed: false, internalType: 'bytes', name: 'transaction', type: 'bytes' },
      ],
      name: 'MessageReceived',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'uint256', name: 'originChainId', type: 'uint256' },
        { indexed: true, internalType: 'uint256', name: 'messageId', type: 'uint256' },
        { indexed: true, internalType: 'bytes32', name: 'txId', type: 'bytes32' },
        { indexed: false, internalType: 'bytes', name: 'transaction', type: 'bytes' },
        { indexed: false, internalType: 'bytes', name: 'reason', type: 'bytes' },
      ],
      name: 'MessageExecutionFailed',
      type: 'event',
    },
  ],
}
