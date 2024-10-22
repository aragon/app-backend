import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum EnumQueueName {
  daoTransactions = 'dao.transactions',
  daoAssets = 'dao.assets',
  daoMetrics = 'dao.metrics',
  proposalMultisigMetrics = 'proposal.multisig.metrics',
  proposalTokenVotingMetrics = 'proposal.token.metrics',
  plugins = 'log.plugins',
  logDao = 'log.dao',
}

export interface IQueueDao {
  address: HexAddress
  network: NetworksEnum
  blockNumber?: number
}

export interface IQueueProposalMetrics {
  network: NetworksEnum
  proposalIndex: string
  pluginAddress: HexAddress
}

export interface IQueueMessage {
  id: string
  params: IQueueProposalMetrics | IQueueDao
}

export interface ISendOptions {
  waitResponse?: boolean
  timeout?: number // reject response after timeout
}
