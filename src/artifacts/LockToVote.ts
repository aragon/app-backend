export const LockToVote = {
  abi: [
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'proposalId',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'voter',
          type: 'address',
        },
      ],
      name: 'VoteCleared',
      type: 'event',
    },
  ],
}
