import { type HexAddress, type NetworksEnum } from '@src/types/networks'

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
  tokenInfo = 'token.info',
  proposalActions = 'proposal.actions',
  canCreateProposal = 'can.create.proposal',
  pluginInstallationData = 'plugin.installation.data',
  getTokenStats = 'token.stats',
  logSelectorPermission = 'log.selector.permission',
  syncMerkleProofs = 'sync.merkle.proofs',
}

export interface IQueueAllMetrics {
  network: NetworksEnum
}

export interface IQueueDao {
  address: HexAddress
  network: NetworksEnum
  blockNumber?: number
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
}
