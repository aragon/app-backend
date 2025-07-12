export const ExecuteSelectorCondition = {
  abi: [
    {
      anonymous: false,
      inputs: [
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
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
      ],
      name: 'NativeTransfersAllowed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'where',
          type: 'address',
        },
      ],
      name: 'NativeTransfersDisallowed',
      type: 'event',
    },
  ],
}
