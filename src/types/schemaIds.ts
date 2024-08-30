import {
  type HexAddress,
  type IEventLogPluginType,
  type ITransactionCategory,
  type ITransferSide,
  type ITransferType,
  type NetworksEnum,
} from '@src/types/index'

export interface IVoteIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalIndex: number
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
  transactionHash: HexAddress
  daoAddress: HexAddress
}

export interface IPluginRepoIdParams {
  transactionHash: HexAddress
  pluginRepo: HexAddress
}

export interface ISettingIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
}

export interface ILogPluginSetupProcessorIdParams {
  transactionHash: HexAddress
  event: IEventLogPluginType
}

export interface IMemberTransactionIdParams {
  transactionHash: HexAddress
  address: HexAddress
  side: ITransferSide
  type: ITransferType
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
