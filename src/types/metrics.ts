import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IMetricAction {
  increaseDelegateReceivedCount = 'increaseDelegateReceivedCount',
  increaseDelegateSentCount = 'increaseDelegateSentCount',
  increaseVoteCount = 'increaseVoteCount',
  increaseProposalCount = 'increaseProposalCount',
}

export interface IMemberVoteMetrics {
  address: HexAddress
  firstActivity: number
  lastActivity: number
  network: NetworksEnum
}
