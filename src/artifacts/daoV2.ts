export const DaoV2 = {
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'sender',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'NativeTokenDeposited',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'actor',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'callId',
          type: 'bytes32',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'to',
              type: 'address',
            },
            {
              internalType: 'uint256',
              name: 'value',
              type: 'uint256',
            },
            {
              internalType: 'bytes',
              name: 'data',
              type: 'bytes',
            },
          ],
          indexed: false,
          internalType: 'struct IDAO.Action[]',
          name: 'actions',
          type: 'tuple[]',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'failureMap',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes[]',
          name: 'execResults',
          type: 'bytes[]',
        },
      ],
      name: 'Executed',
      type: 'event',
    },
  ],
}
