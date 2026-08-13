import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type ISppConditionRuleResponse } from '@src/types/routers'

export enum EnumQueueName {
  allMetrics = 'all.metrics',
  daoTransactions = 'dao.transactions',
  daoAssets = 'dao.assets',
  daoMetrics = 'dao.metrics',
  proposalMultisigMetrics = 'proposal.multisig.metrics',
  proposalTokenVotingMetrics = 'proposal.token.metrics',
  plugins = 'log.plugins',
  requeue = 'log.requeue',
  logDao = 'log.dao',
  contractInfo = 'contract.info',
  getVotingPower = 'member.votingPower',
  getLockVotingPowerBatch = 'member.lockVotingPowerBatch',
  memberBalance = 'member.balance',
  contractDecoder = 'contract.decoder',
  contractDecoderLight = 'contract.decoder.light',
  tokenInfo = 'token.info',
  proposalActions = 'proposal.actions',
  executionActions = 'execution.actions',
  canCreateProposal = 'can.create.proposal',
  pluginInstallationData = 'plugin.installation.data',
  gaugeEpochId = 'plugin.gauge.epochId',
  gaugeInfo = 'plugin.gauge.info',
  gaugeRewardDistribution = 'plugin.gauge.rewardDistribution',
  gaugeRewardDistributionByGauge = 'plugin.gauge.rewardDistributionByGauge',
  getTokenStats = 'token.stats',
  logSelectorPermission = 'log.selector.permission',
  syncMerkleProofs = 'sync.merkle.proofs',
  metadataRefetch = 'metadata.refetch',
  governanceRewardDistribution = 'governance.rewardDistribution',
  tokenTotalSupply = 'token.totalSupply',
  syncDelegateChanged = 'sync.delegate.changed',
  eventReplay = 'event.replay',
  crossChainGasLimit = 'crosschain.gasLimit',
  sppRuleCondition = 'condition.sppRule',
}

export interface IQueueSppRuleCondition {
  sentAt: number
  network: NetworksEnum
  conditionAddresses: HexAddress[]
}

export interface ISppRuleConditionQueueResponse {
  rulesByCondition: Record<string, ISppConditionRuleResponse[]>
}

export interface IQueueAllMetrics {
  network: NetworksEnum
}

export interface IQueueDaoTransactions {
  daoAddress: HexAddress
  network: NetworksEnum
  reset?: boolean
  resetExecutions?: boolean
}

export interface IQueueEventReplay {
  txHash: string
  network: NetworksEnum
}

export interface IQueueExecutionActions {
  id: string
}

/**
 * Payload for the `dao.assets` / `dao.metrics` queues. Without `tokenAddress` or `native`
 * the consumer runs a full portfolio rescan for the DAO.
 */
export interface IQueueDao {
  address: HexAddress
  network: NetworksEnum
  blockNumber?: number
  tokenAddress?: HexAddress
  native?: boolean
}

export interface IQueuePlugin {
  address: HexAddress
  network: NetworksEnum
  isHistorical?: boolean
  conditionAddress?: HexAddress
}

export interface IGetVotingPower {
  userAddress: HexAddress
  tokenAddress: HexAddress
  network: NetworksEnum
}

export interface IQueueContractInfo {
  address: HexAddress
  network: NetworksEnum
}

export interface IQueueCanCreateProposal {
  memberAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
}

export interface IQueueMemberBalanceInfo {
  userAddress: HexAddress
  tokenAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
}

export interface IQueueProposalMetrics {
  network: NetworksEnum
  proposalIndex: string
  pluginAddress: HexAddress
}

export interface IQueueMessage {
  id: string
  params: IQueueProposalMetrics | IQueueDao | any
}

export interface ISendOptions {
  waitResponse?: boolean
  timeout?: number // reject response after timeout
}

export interface IGetLockVotingPowerBatch {
  locks: Array<{
    lockId: string
    tokenId: string
    escrowAddress: HexAddress
    timestamp: number
    network: NetworksEnum
  }>
}

export interface IThrottleOptions {
  maxQueueSize?: number // Maximum number of messages allowed in queue (default: 50)
  retryDelay?: number // Delay in ms between retry attempts (default: 3000)
  logContext?: any // Additional context for logging
}

export interface IMerkleProofSync {
  campaignId: string
  pluginAddress: HexAddress
  network: NetworksEnum
  isDraft?: boolean
}

export interface IGetGaugeEpochId {
  pluginAddress: HexAddress
  network: NetworksEnum
}

export interface IGetGaugeRewardDistribution {
  pluginAddress: HexAddress
  network: NetworksEnum
  epochId: number
  rewardTotalAmount: string
}

export interface IGetGaugeInfoId {
  pluginAddress: HexAddress
  memberAddress?: HexAddress
  network: NetworksEnum
}

export interface IQueueTokenInfo {
  address: HexAddress
  network: NetworksEnum
  forceUpdate?: boolean
}

export interface IGaugeInfo {
  pluginAddress: HexAddress
  network: NetworksEnum
  enableUpdateVotingPowerHook: boolean
  epochId: string | null
  currentEpochStart: number | null
  epochVoteStart: number | null
  epochVoteEnd: number | null
  totalVotingPower: string
  memberAddress?: HexAddress
  memberUsedVotingPower?: string
  memberVotingPower?: string
}

export interface IQueueTokenTotalSupply {
  address: HexAddress
  network: NetworksEnum
}

export interface IGetGovernanceRewardDistribution {
  pluginAddress: HexAddress
  network: NetworksEnum
  lookbackDate: string
  rewardTotalAmount: string
}

export interface IQueueContractDecoderLight {
  /**
   * Sender address (usually the DAO). The light decoder never reads it — it is only echoed back on
   * each result — so callers may omit it.
   *
   * If an action ever needs it to decode, handle both cases explicitly: decode fully when it is
   * provided, and fall back to `Unknown` when it is not.
   */
  from?: HexAddress
  actions: Array<{
    to: string
    data: string
    value: string | number
  }>
  network: NetworksEnum
}

export interface IQueueSyncDelegateChanged {
  pluginAddress: HexAddress
  network: NetworksEnum
}
