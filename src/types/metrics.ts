import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ICrawlStat {
  nbWorked: number
  nbTotal: number
  remaining: number
}

export interface IMemberProposalMetrics {
  proposalCount: number
  voteCount: number
}

export interface IMemberActivityMetrics {
  firstActivity: {
    blockNumber: number
    network: NetworksEnum
  }
  lastActivity: {
    blockNumber: number
    network: NetworksEnum
  }
}
export interface IMemberVoteMetrics {
  address: HexAddress
  firstActivity: number
  lastActivity: number
  network: NetworksEnum
}
