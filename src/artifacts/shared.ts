export const SharedLogs = {
  _format: 'hh-sol-artifact-1',
  contractName: 'SharedLogs',
  sourceName: '',
  abi: [
    {
      type: 'event',
      name: 'ProposalCreated',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
        {
          name: 'creator',
          type: 'address',
          indexed: true,
          internalType: 'address',
        },
        {
          name: 'startDate',
          type: 'uint64',
          indexed: false,
          internalType: 'uint64',
        },
        {
          name: 'endDate',
          type: 'uint64',
          indexed: false,
          internalType: 'uint64',
        },
        {
          name: 'metadata',
          type: 'bytes',
          indexed: false,
          internalType: 'bytes',
        },
        {
          name: 'actions',
          type: 'tuple[]',
          indexed: false,
          internalType: 'struct Action[]',
          components: [
            {
              name: 'to',
              type: 'address',
              internalType: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
              internalType: 'uint256',
            },
            {
              name: 'data',
              type: 'bytes',
              internalType: 'bytes',
            },
          ],
        },
        {
          name: 'allowFailureMap',
          type: 'uint256',
          indexed: false,
          internalType: 'uint256',
        },
      ],
      anonymous: false,
    },
    {
      type: 'event',
      name: 'ProposalExecuted',
      inputs: [
        {
          name: 'proposalId',
          type: 'uint256',
          indexed: true,
          internalType: 'uint256',
        },
      ],
      anonymous: false,
    },
  ],
  bytecode: '',
  deployedBytecode: '',
  linkReferences: {},
  deployedLinkReferences: {},
}
