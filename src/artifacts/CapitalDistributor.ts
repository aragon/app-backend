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
          name: 'metadataURI',
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
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'actionEncoder',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'bool',
          name: 'multipleClaimsAllowed',
          type: 'bool',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'startTime',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endTime',
          type: 'uint256',
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
      ],
      name: 'CampaignDeactivated',
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
          internalType: 'address',
          name: 'plugin',
          type: 'address',
        },
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
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalClaimed',
          type: 'uint256',
        },
      ],
      name: 'PayoutClaimed',
      type: 'event',
    },
  ],
}
