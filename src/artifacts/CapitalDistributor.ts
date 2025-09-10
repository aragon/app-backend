export const CapitalDistributor = {
  _format: 'hh-sol-artifact-1',
  contractName: 'CapitalDistributor',
  sourceName: 'src/CapitalDistributor.sol',
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes',
          name: 'metadataUri',
          type: 'bytes',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'allocationStrategy',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'contract IERC20',
          name: 'token',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'contract IPayoutActionEncoder',
          name: 'actionEncoder',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'startTime',
          type: 'uint64',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'endTime',
          type: 'uint64',
        },
      ],
      name: 'CampaignCreated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'merkleRoot',
          type: 'bytes32',
        },
      ],
      name: 'MerkleCampaignSet',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'oldMerkleRoot',
          type: 'bytes32',
        },
        {
          indexed: false,
          internalType: 'bytes32',
          name: 'newMerkleRoot',
          type: 'bytes32',
        },
      ],
      name: 'MerkleCampaignUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignId',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'recipient',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'PayoutClaimed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: true, internalType: 'uint256', name: 'campaignId', type: 'uint256' }],
      name: 'CampaignPaused',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: true, internalType: 'uint256', name: 'campaignId', type: 'uint256' }],
      name: 'CampaignResumed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: true, internalType: 'uint256', name: 'campaignId', type: 'uint256' }],
      name: 'CampaignEnded',
      type: 'event',
    },
  ],
}
