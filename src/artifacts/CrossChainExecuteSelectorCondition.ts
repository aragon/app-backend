export const CrossChainExecuteSelectorCondition = {
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'chainId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes4',
          name: 'selector',
          type: 'bytes4',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
      ],
      name: 'SelectorAllowed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'chainId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes4',
          name: 'selector',
          type: 'bytes4',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
      ],
      name: 'SelectorDisallowed',
      type: 'event',
    },
  ],
}
