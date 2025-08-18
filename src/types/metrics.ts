import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@src/types/eventLogs'

export interface IGovernanceParamsOpts {
  tokenIds?: string[]
  tokenId?: string
  lastActivity?: number
  votingPower?: string
  delegateReceivedCount?: number
  delegateReceiverAddress?: string | null

  // VeGovernance
  parsedEvent?: LogDescription
  info?: ILogInfo
}

export interface IVoteAggregation {
  type: number
  totalVotes: number
  totalVotingPower: bigint
}
