import {
  type HexAddress,
  type IEventLogPluginType,
  type LogServicePattern,
  type NetworksEnum,
  type TransferTokenType,
} from '@src/types/index'

export interface IVoteIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface IVoteGaugeIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  pluginAddress?: HexAddress
}

export interface ILockExtraParams {
  network?: NetworksEnum
  escrowAddress?: HexAddress
  memberAddress?: HexAddress
  onlyActive?: boolean
}

export interface ILockFindMemberParams {
  network: NetworksEnum
  memberAddress: HexAddress
  escrowAddress?: HexAddress
  tokenId: string
  exitQueueAddress?: HexAddress
}

export interface ILockIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  tokenAddress: HexAddress
  memberAddress: HexAddress
  tokenId: string
  escrowAddress: HexAddress
}

export interface IGaugeIdParams {
  network: NetworksEnum
  address: HexAddress
  pluginAddress: HexAddress
}

export interface IAssetIdParams {
  network: NetworksEnum
  daoAddress: HexAddress
  tokenAddress: HexAddress
}

export interface IConfigIndexerIdParams {
  network: NetworksEnum
  service: LogServicePattern
}

export interface IDaoIdParams {
  network: NetworksEnum
  address: HexAddress
}

export interface ILogMetadataIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface ILockToVoteMemberIdParams {
  network: NetworksEnum
  lockManagerAddress: HexAddress
  memberAddress: HexAddress
}

export interface IPluginRepoIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface IPluginSlugIdParams {
  network: NetworksEnum
  daoAddress: HexAddress
  pluginAddress: HexAddress
  slug: string
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

export interface IMemberIdParams {
  address: HexAddress
}

export interface IPluginIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  address: HexAddress
}

export interface IProposalIdParams {
  transactionHash: HexAddress
  pluginAddress: HexAddress
  proposalIndex: string
}

export interface ITokenIdParams {
  network: NetworksEnum
  address: HexAddress
}

export interface ITransactionIdParams {
  transactionHash: HexAddress
  network: NetworksEnum
  daoAddress: HexAddress
  logIndex?: number
  transactionIndex?: number
  type: TransferTokenType
  tokenAddress?: string
  tokenId?: string
  proposalId?: string
  batchIndex?: number
  actionIndex?: number
}

export interface IDaoPermissionId {
  network: NetworksEnum
  daoAddress: HexAddress
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
}

export interface ISelectorPermissionIdParams {
  network: NetworksEnum
  transactionHash: HexAddress
  transactionIndex: number
  logIndex: number
  conditionAddress: HexAddress
}

export interface ICampaignParams {
  pluginAddress: HexAddress
  network: NetworksEnum
  campaignId: string
}

export interface IRewardParams {
  pluginAddress: HexAddress
  network: NetworksEnum
  campaignId: string
  userAddress: HexAddress
}

export interface IPluginMemberIdParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  memberAddress: HexAddress
}

export interface ITokenMemberIdParams {
  network: NetworksEnum
  tokenAddress: HexAddress
  memberAddress: HexAddress
}

export interface IPluginMetricsIdParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  memberAddress: HexAddress
}

export interface IGaugeMetricsIdParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  gaugeAddress: HexAddress
  epochId: string
}
