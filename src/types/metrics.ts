import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface IMemberProposalMetrics {
  proposalCount: number
  voteCount: number
}

export interface IMemberVoteMetrics {
  address: HexAddress
  firstActivity: number
  lastActivity: number
  network: NetworksEnum
}
