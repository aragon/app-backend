import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum EnumQueueName {
  allMetrics = 'all.metrics',
  daoTransactions = 'dao.transactions',
  daoAssets = 'dao.assets',
  daoMetrics = 'dao.metrics',
  proposalMultisigMetrics = 'proposal.multisig.metrics',
  proposalTokenVotingMetrics = 'proposal.token.metrics',
  plugins = 'log.plugins',
  logDao = 'log.dao',
  contractInfo = 'contract.info',
  voteInfo = 'vote.info',
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
}

export interface IQueueAllMetrics {
  network: NetworksEnum
}

export interface IQueueDao {
  address: HexAddress
  network: NetworksEnum
  blockNumber?: number
  proposalId?: string
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

export interface IQueueRealtimeTransactions {
  daoAddresses: HexAddress[]
  network: NetworksEnum
  transactionHash: HexAddress
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
