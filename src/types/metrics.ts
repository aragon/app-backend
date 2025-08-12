export interface IGovernanceParamsOpts {
  tokenIds?: string[]
  lastActivity?: number
  votingPower?: string
  delegateReceivedCount?: number
}

export interface IVoteAggregation {
  type: number
  totalVotes: number
  totalVotingPower: bigint
}
