import type { IFormattedLog, ILogInfo } from '@src/types/eventLogs'
import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { LogServicePattern } from '@types'
import { type Filter, type Log, type LogDescription } from 'ethers'

export type { TopicFilter } from 'ethers'

// ============================================
// Adaptive Batch Size Manager Types
// ============================================

/**
 * Configuration for adaptive batch sizing behavior
 *
 * @property initialBatchDays - Starting batch size in days (default: 60 days)
 * @property minBatchDays - Minimum batch size in days (default: 0.05 = 1.2 hours)
 * @property maxBatchDays - Maximum batch size in days (default: 365 = 1 year)
 * @property reductionFactor - Factor to reduce batch size on error (default: 2)
 * @property growthFactor - Factor to grow batch size on success (default: 1.5)
 * @property successThresholdForGrowth - Consecutive successes before growing (default: 3)
 * @property densityThresholds - Event density thresholds for optimization
 */
export interface IAdaptiveBatchConfig {
  initialBatchDays?: number
  minBatchDays?: number
  maxBatchDays?: number
  reductionFactor?: number
  growthFactor?: number
  successThresholdForGrowth?: number
  densityThresholds?: {
    veryHigh?: number // > 50 events/block (default)
    high?: number // > 10 events/block (default)
    medium?: number // > 1 event/block (default)
    low?: number // > 0.1 events/block (default)
  }
}

/**
 * Internal state for adaptive batch sizing
 * Tracks the current state of the adaptive batch manager
 */
export interface IAdaptiveBatchState {
  currentBatchSize: number // Current batch size in blocks
  originalBatchSize: number // Original/initial batch size in blocks
  consecutiveSuccesses: number // Number of consecutive successful fetches
  consecutiveErrors: number // Number of consecutive errors
  lastEventDensity: number // Events per block in last fetch
  reductionCount: number // Times batch size was reduced
  isInHighActivityZone: boolean // Currently in high activity zone (dense events)
  lastSuccessfulBatchSize: number // Last batch size that worked successfully
  totalEventsProcessed: number // Total events processed so far
  totalBlocksProcessed: number // Total blocks processed so far
  consecutiveEmptyRanges: number // Track consecutive empty ranges for skip-ahead optimization
}

// ============================================
// Batch Request Manager Types
// ============================================

/**
 * Configuration for batch request manager
 */
export interface IBatchRequestConfig {
  network: NetworksEnum
  address?: string | string[]
  isTopicObject?: boolean // Whether topics is a complex filter object
}

/**
 * RPC request structure for JSON-RPC 2.0
 */
export interface IRPCRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params: any[]
}

/**
 * RPC response structure
 */
export interface IRPCResponse {
  jsonrpc?: '2.0'
  id?: string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

/**
 * Batch response processing result
 */
export interface IBatchProcessingResult {
  successfulResponses: IRPCResponse[]
  failedResponses: IRPCResponse[]
  batchSizeErrors: IRPCResponse[]
  rateLimitErrors: IRPCResponse[]
}

// ============================================
// Crawler Error Handler Types
// ============================================

/**
 * Types of errors the crawler can encounter
 */
export enum CrawlerErrorType {
  RATE_LIMITED = 'RATE_LIMITED',
  BATCH_SIZE_ERROR = 'BATCH_SIZE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Configuration for error handler
 */
export interface IErrorHandlerConfig {
  maxRetries?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  stopOnError?: boolean
}

/**
 * Error analysis result
 */
export interface IErrorAnalysis {
  type: CrawlerErrorType
  shouldRetry: boolean
  backoffMs?: number
  message: string
}

// ============================================
// Log Processing Engine Types
// ============================================

/**
 * Configuration for log processing engine
 */
export interface ILogProcessingConfig {
  events: IIndexerConfig[]
  isTopicObject: boolean
  onlyHistorical?: boolean
  stopOnError?: boolean
  onError?: (error: Error, log?: Log) => void
}

/**
 * Context for processing a batch of logs
 */
export interface IProcessingContext {
  fromBlock: number
  toBlock: number
  latestBlock: number
}

/**
 * Processing statistics
 */
export interface IProcessingStats {
  nbSuccess: number
  nbError: number
  nbTotal: number
  lastSync: number
}

// ============================================
// Progress Tracker Types
// ============================================

/**
 * Configuration for progress tracker
 */
export interface IProgressTrackerConfig {
  network: NetworksEnum
  service: LogServicePattern
  initialBlock?: number
}

/**
 * Progress information returned by the tracker
 */
export interface IProgressInfo {
  lastSync: number
  isEnded: boolean
  exists: boolean
}

// ============================================
// Indexer Configuration Types
// ============================================

export interface IIndexerConfigHandler {
  abi: any[]
  handler:
    | ((event: LogDescription, info: ILogInfo, isHistorical?: boolean) => Promise<any>)
    | ((events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) => Promise<any>)
}

export interface IIndexerConfig {
  event: string
  enableHistorical?: boolean
  topic: string | any
  config: IIndexerConfigHandler[]
}

export enum ICrawStrategy {
  getLogsWithoutTopics = 'getLogsWithoutTopics',
  getBlockReceipts = 'getBlockReceipts',
  getLogsByBatch = 'getLogsByBatch',
}

export interface IParallelConfig {
  enable: boolean
  concurrency?: number
  batchSize?: number
  autoScale?: boolean
  useBatch?: boolean
}

export interface ICrawlParam {
  network: NetworksEnum
  fromBlock?: number
  toBlock?: number | string
  address?: HexAddress | HexAddress[] | string | string[]
  events: IIndexerConfig[]
  stopOnError: boolean
  parallel?: boolean | IParallelConfig
  onlyHistorical?: boolean
  oneBlockPerTime?: boolean
  filterLogs?: (logs: any) => Promise<any>
  strategy?: ICrawStrategy
  logService?: LogServicePattern
  onError: (error: Error, log?: Log) => void
  skipLogProcessing?: boolean
  isTopicObject?: boolean
  batchSize?: number
  adaptiveConfig?: IAdaptiveBatchConfig
}

export interface ICrawlSetting {
  debugLogs: IFormattedLog[]
  shutdown: boolean
  crawling: boolean
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

export enum TokenTransfer {
  Transfer = 'Transfer',
}

export enum GaugeLogs {
  GaugeCreated = 'GaugeCreated',
  GaugeActivated = 'GaugeActivated',
  GaugeDeactivated = 'GaugeDeactivated',
  GaugeMetadataUpdated = 'GaugeMetadataUpdated',
  Voted = 'Voted',
  Reset = 'Reset',
}

export enum IGovernanceErc20Logs {
  DelegateVotesChanged = 'DelegateVotesChanged',
}

export enum ILogToVoteLogs {
  ProposalCreated = 'ProposalCreated',
  ProposalExecuted = 'ProposalExecuted',
  VoteCast = 'VoteCast',
  VotingSettingsUpdated = 'VotingSettingsUpdated',
  MetadataSet = 'MetadataSet',
  VoteCleared = 'VoteCleared',
}

export enum ILockManager {
  BalanceLocked = 'BalanceLocked',
  BalanceUnlocked = 'BalanceUnlocked',
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

export enum ICapitalDistributorLogs {
  MetadataSet = 'MetadataSet',
  CampaignCreated = 'CampaignCreated',
  CampaignDeactivated = 'CampaignDeactivated',
  PayoutClaimed = 'PayoutClaimed',
}

export enum ICapitalDistributorStrategyEvents {
  MerkleCampaignSet = 'MerkleCampaignSet',
  MerkleCampaignUpdated = 'MerkleCampaignUpdated',
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

export enum IVotingEscrowIncreasingLogs {
  Deposit = 'Deposit',
  Withdraw = 'Withdraw',
  MinDepositSet = 'MinDepositSet',
  Split = 'Split',
  Merged = 'Merged',
}

export enum IVotingEscrowAdapterLogs {
  TokensUndelegated = 'TokensUndelegated',
  TokensDelegated = 'TokensDelegated',
}

export enum IExitQueueLogs {
  ExitQueued = 'ExitQueued',
  MinLockSet = 'MinLockSet',
  ExitQueuedV2 = 'ExitQueuedV2',
  ExitFeePercentAdjusted = 'ExitFeePercentAdjusted',
}

export enum ISelectorPermissionLogs {
  SelectorAllowed = 'SelectorAllowed',
  SelectorDisallowed = 'SelectorDisallowed',
  NativeTransfersAllowed = 'NativeTransfersAllowed',
  NativeTransfersDisallowed = 'NativeTransfersDisallowed',
}

// Events from source/model contracts (SourceSettingsUpdated, ModelSettingsUpdated, PluginDefined)
export enum IPolicySourceModelLogs {
  SourceSettingsUpdated = 'SourceSettingsUpdated',
  PluginDefined = 'PluginDefined',
  ModelSettingsUpdated = 'ModelSettingsUpdated',
}

// Events from plugin contracts (RouterSettingsUpdated, ClaimerSettingsUpdated)
export enum IPolicyPluginSettingsLogs {
  RouterSettingsUpdated = 'RouterSettingsUpdated',
  ClaimerSettingsUpdated = 'ClaimerSettingsUpdated',
}

export interface ICapitalDistributorStats {
  totalClaimed: string // Sum of all claimed amounts from events
  totalClaimable: string // Sum of the claimable amounts for all campaigns
}

export interface IUserCampaignStatus {
  totalClaimed: string // Sum of all claimed amounts across all campaigns for the user
  totalClaimable: string // Sum of all unclaimed amounts across all campaigns for the user
}
