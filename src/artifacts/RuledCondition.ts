export const RuledCondition = {
  abi: [
    {
      inputs: [],
      name: 'getRules',
      outputs: [
        {
          components: [
            {
              internalType: 'uint8',
              name: 'id',
              type: 'uint8',
            },
            {
              internalType: 'uint8',
              name: 'op',
              type: 'uint8',
            },
            {
              internalType: 'uint240',
              name: 'value',
              type: 'uint240',
            },
            {
              internalType: 'bytes32',
              name: 'permissionId',
              type: 'bytes32',
            },
          ],
          internalType: 'struct RuledCondition.Rule[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

export const SafeOwnerCondition = {
  abi: [
    {
      inputs: [],
      name: 'safe',
      outputs: [
        {
          internalType: 'contract IOwnerManager',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}
