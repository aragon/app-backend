export enum IMetricAction {
  decreaseDelegateReceivedCount = 'decreaseDelegateReceivedCount',
  increaseDelegateReceivedCount = 'increaseDelegateReceivedCount',
  increaseVoteCount = 'increaseVoteCount',
  increaseProposalCount = 'increaseProposalCount',
}

export interface IVoteAggregation {
  type: number
  totalVotes: number
  totalVotingPower: bigint
}
