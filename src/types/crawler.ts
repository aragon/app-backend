import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { IEnumIndexerService, IEnumIndexerServiceStatic } from '@src/types/services'
import type { ILogInfo } from '@src/types/eventLogs'
import { type LogDescription, type Log, type Filter } from 'ethers'

export interface IIndexerConfig {
  event: string
  abi: any[]
  handler: (event: LogDescription, info: ILogInfo) => Promise<any>
  enableHistorical: boolean
  enableRealtime: boolean
  topic: string
}

export interface ICrawlParam {
  network: NetworksEnum
  fromBlock?: number
  toBlock?: number | string
  address?: HexAddress | HexAddress[] | string | string[]
  events: IIndexerConfig[]
  stopOnError: boolean
  logService: IEnumIndexerService | IEnumIndexerServiceStatic | null
  onError: (error: Error, log?: Log) => void
}

export interface ICrawlSetting {
  shutdown: boolean
  crawling: boolean
  isOnError: boolean
  batchSize: number
  originalBatchSize: number
  runCount: number
  filter: Filter
  nbSuccess: number
  nbError: number
  nbTotal: number
  lastSync: number
}

export enum ITokenVotingLogs {
  VoteCast = 'VoteCast',
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
  VotingSettingsUpdated = 'VotingSettingsUpdated',
}

export enum IGovernanceErc20Logs {
  Transfer = 'Transfer',
  DelegateVotesChanged = 'DelegateVotesChanged',
}

export enum IMultiSigLogs {
  MultisigSettingsUpdated = 'MultisigSettingsUpdated',
  MembersAdded = 'MembersAdded',
  MembersRemoved = 'MembersRemoved',
  Approved = 'Approved',
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
}

export enum IAdminLogs {
  MembersAdded = 'MembersAdded',
  MembersRemoved = 'MembersRemoved',
}

export enum ISPPLogs {
  StagesUpdated = 'StagesUpdated',
  ProposalAdvanced = 'ProposalAdvanced',
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
}
