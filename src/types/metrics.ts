export enum IMetricAction {
  decreaseDelegateReceivedCount = 'decreaseDelegateReceivedCount',
  decreaseDelegateSentCount = 'decreaseDelegateSentCount',
  increaseDelegateReceivedCount = 'increaseDelegateReceivedCount',
  increaseDelegateSentCount = 'increaseDelegateSentCount',
  increaseVoteCount = 'increaseVoteCount',
  increaseProposalCount = 'increaseProposalCount',
}

export interface IVoteAggregation {
  type: number
  totalVotes: number
  totalVotingPower: bigint
}
