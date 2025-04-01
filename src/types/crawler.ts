import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { IEnumIndexerService, IEnumIndexerServiceStatic } from '@src/types/services'
import type { IFormattedLog, ILogInfo } from '@src/types/eventLogs'
import { type Filter, type Log, type LogDescription } from 'ethers'

export interface IIndexerConfigHandler {
  abi: any[]
  handler: (event: LogDescription, info: ILogInfo, isHistorical?: boolean) => Promise<any>
}

export interface IIndexerConfig {
  event: string
  enableHistorical?: boolean
  topic: string | any
  config: IIndexerConfigHandler[]
}

export enum ICrawStrategy {
  getLogs = 'getLogs',
  getBlockReceipts = 'getBlockReceipts',
}

export interface ICrawlParam {
  network: NetworksEnum
  fromBlock?: number
  toBlock?: number | string
  address?: HexAddress | HexAddress[] | string | string[]
  events: IIndexerConfig[]
  stopOnError: boolean
  onlyHistorical?: boolean
  oneBlockPerTime?: boolean
  filterLogs?: (logs: any) => Promise<any>
  strategy?: ICrawStrategy
  logService: IEnumIndexerService | IEnumIndexerServiceStatic | null
  onError: (error: Error, log?: Log) => void
  skipLogProcessing?: boolean
  isTopicObject?: boolean
  batchSize?: number
}

export interface ICrawlSetting {
  debugLogs: IFormattedLog[]
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
  MetadataSet = 'MetadataSet',
}

export enum LockErc721Token {
  Transfer = 'Transfer',
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
  MetadataSet = 'MetadataSet',
}

export enum IAdminLogs {
  MembersAdded = 'MembersAdded',
  MembersRemoved = 'MembersRemoved',
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
}

export enum ISPPLogs {
  StagesUpdated = 'StagesUpdated',
  ProposalAdvanced = 'ProposalAdvanced',
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
  MetadataSet = 'MetadataSet',
}

export enum IDaoLogs {
  Granted = 'Granted',
  Revoked = 'Revoked',
}
