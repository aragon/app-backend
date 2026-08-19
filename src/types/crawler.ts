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
  /**
   * Block timestamps the fetch layer already holds, seeded into the TickContext so
   * handlers read them without a round trip. HyperSync returns them alongside the
   * logs; the RPC path leaves this undefined.
   */
  blockTimestamps?: Map<number, number>
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

/**
 * Per-network state held by the incremental DAO address cache
 */
export interface INetworkCacheState {
  /**
   * Lowercase address -> checksummed address exactly as stored in the DB.
   * DB queries and handlers must always receive the checksummed value.
   */
  byLower: Map<string, string>
  cursor: Date | null
  refreshing: Promise<void> | null
}

/**
 * Per-network state held by the incremental token eligibility cache.
 * A token is eligible when present in BOTH maps (installed tokenVoting
 * plugin token ∩ syncable delegate token), mirroring the previous
 * Plugin.distinct/Token.distinct intersection.
 */
export interface ITokenEligibilityCacheState {
  /** Lowercase tokenAddress -> checksummed value of eligible tokenVoting plugins */
  pluginTokensByLower: Map<string, string>
  /** Lowercase address -> checksummed value of syncable delegate tokens */
  tokensByLower: Map<string, string>
  pluginCursor: Date | null
  tokenCursor: Date | null
  refreshing: Promise<void> | null
}

// ============================================
// Indexer Configuration Types
// ============================================

export interface IIndexerConfigHandler {
  abi: any[]
  handler:
    | ((event: LogDescription, info: ILogInfo, isHistorical?: boolean) => Promise<any>)
    | ((events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) => Promise<any>)
  batchHandler?: (events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) => Promise<any>
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

// ============================================
// HyperSync Crawler Types
// ============================================

/**
 * Stream tuning passed straight through to the HyperSync client.
 * Names match `StreamConfig` in @envio-dev/hypersync-client so a client upgrade
 * shows up here as a type error rather than a silently ignored option.
 *
 * Only the two Envio recommends tuning are set by default. The rest are optional
 * escape hatches for a specific caller — the client sizes batching and buffering
 * itself from measured response density, so leaving them unset is the norm.
 */
export interface IHyperStreamConfig {
  concurrency: number
  responseBytesTarget: number
  batchSize?: number
  minBatchSize?: number
  maxBatchSize?: number
  maxBufferedBytes?: number
  reverse?: boolean
}

/**
 * A HyperSync log filter, mirroring `LogFilter` in the client.
 *
 * `topics` is POSITIONAL and far richer than an eth_getLogs topic list: `topics[n]`
 * is the set of accepted values for topic n, and an empty array at a position means
 * "any". So `[[transferTopic], [], [daoTopic]]` reads as "Transfer, from anyone, to
 * this DAO". Omitted `address` / `topics` match everything.
 */
export interface IHyperLogFilter {
  address?: string[]
  topics?: string[][]
}

/**
 * An include filter with an optional exclude filter subtracted from it. The exclude
 * half has no eth_getLogs equivalent — the RPC crawler can only filter this out
 * client-side, after paying to fetch the logs.
 */
export interface IHyperLogSelection {
  include: IHyperLogFilter
  exclude?: IHyperLogFilter
}

/**
 * Params for HyperSyncLogCrawler.
 *
 * Deliberately NOT ICrawlParam: `toBlock` here is EXCLUSIVE, matching HyperSync's
 * [fromBlock, toBlock) range, while ICrawlParam.toBlock is inclusive. Keeping the
 * two types apart is what stops the conventions being mixed by accident.
 */
export interface IHyperCrawlParam {
  network: NetworksEnum
  events: IIndexerConfig[]
  fromBlock?: number
  /** Exclusive upper bound. Omit to stream until the chain head. */
  toBlock?: number
  /** Server-side address filter. Omit for a whole-chain topic scan. */
  address?: HexAddress | HexAddress[] | string | string[]
  /**
   * The query's log selections, OR'd together server-side. Replaces the default
   * selection built from `events` + `address`, so whatever it matches must still
   * have a matching entry in `events` to be parsed and handled.
   */
  logSelections?: Array<IHyperLogFilter | IHyperLogSelection>
  logService?: LogServicePattern
  stopOnError: boolean
  onlyHistorical?: boolean
  onError: (error: Error, log?: Log) => void
  filterLogs?: (logs: any) => Promise<any>
  streamConfig?: Partial<IHyperStreamConfig>
}

export interface IHyperSyncStats {
  nbSuccess: number
  nbError: number
  nbTotal: number
  lastSync: number
  batches: number
  scanned: number
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
  ObjectionCast = 'ObjectionCast',
  OverrideVoteCast = 'OverrideVoteCast',
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
  DelegateChanged = 'DelegateChanged',
}

export enum IExitQueueLogs {
  ExitQueued = 'ExitQueued',
  MinLockSet = 'MinLockSet',
  ExitQueuedV2 = 'ExitQueuedV2',
  ExitFeePercentAdjusted = 'ExitFeePercentAdjusted',
  ExitCancelled = 'ExitCancelled',
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
