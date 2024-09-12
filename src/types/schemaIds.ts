import {
  type HexAddress,
  type IEventLogPluginType,
  type ITransactionCategory,
  type NetworksEnum,
} from '@src/types/index'

export interface IVoteIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface IAssetIdParams {
  network: NetworksEnum
  daoAddress: HexAddress
  tokenAddress: HexAddress
}

export interface IConfigIndexerIdParams {
  network: NetworksEnum
  service: string
}

export interface IDaoIdParams {
  network: NetworksEnum
  address: HexAddress
}

export interface ILogDaoMetadataIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  daoAddress: HexAddress
}

export interface IPluginRepoIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface ISettingIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
}

export interface ILogPluginSetupProcessorIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  event: IEventLogPluginType
}

export interface IMemberTransactionIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface IMemberIdParams {
  address: HexAddress
}

export interface IMemberMetricsIdParams {
  network: NetworksEnum
  address: HexAddress
  pluginAddress: HexAddress
}

export interface IMemberBalanceIdParams {
  network: NetworksEnum
  address: HexAddress
  tokenAddress: HexAddress
}

export interface IPluginIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  address: HexAddress
}

export interface IProposalIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalIndex: number
}

export interface ITokenIdParams {
  network: NetworksEnum
  address: HexAddress
}

export interface ITransactionIdParams {
  transactionHash: HexAddress
  category: ITransactionCategory
  network: NetworksEnum
}
