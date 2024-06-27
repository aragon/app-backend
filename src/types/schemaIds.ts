import {
  type HexAddress,
  type IEventLogMember,
  type IEventLogPluginType,
  type IPluginAction,
  type ITransactionCategory,
  type NetworksEnum,
} from '@src/types/index'

export interface IVoteIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalId: number
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

export interface ILogDaoRegistryIdParams {
  transactionHash: HexAddress
  address: HexAddress
}

export interface ILogMemberIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  event: IEventLogMember
  address: HexAddress
  pluginAddress: HexAddress
}

export interface ILogPluginRepoIdParams {
  transactionHash: HexAddress
  pluginRepo: HexAddress
}

export interface ILogPluginSettingIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
}

export interface ILogPluginSetupProcessorIdParams {
  transactionHash: HexAddress
  event: IEventLogPluginType
}

export interface ILogProposalIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalId: number
}

export interface ILogProposalMetadataIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalId: number
}

export interface IDelegateIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
}

export interface IMemberIdParams {
  address: HexAddress
}

export interface IPluginIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  action: IPluginAction
}

export interface IProposalIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalId: number
}

export interface ISettingIdParams {
  network: NetworksEnum
  fromTxHash: HexAddress
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
