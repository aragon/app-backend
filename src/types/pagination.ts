import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type ITokenType } from '@src/types/token'
import { type IPluginInterfaceType, type IPluginStatus, type ISettingStatus } from '@src/types/plugin'
import { type IEventLogPluginType, type ITransactionSide, type ITransactionType } from '@types'

export interface ITokenExtraParams {
  network?: NetworksEnum
  type?: ITokenType
  isGovernance?: boolean
}

export enum IGaugeStatus {
  active = 'active',
  inactive = 'inactive',
}

export interface IVoteExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  memberAddress?: HexAddress
  includeInfo?: boolean
  highlightUser?: HexAddress
}

export interface ICanVoteParams {
  memberAddress: HexAddress
  pluginAddress: HexAddress
  proposalIndex: string
  network: NetworksEnum
}

export interface ICanCreateProposalParams {
  memberAddress: HexAddress
  pluginAddress: HexAddress
  network: HexAddress
}

export interface IPairParams {
  daoId?: string
  ens?: string
  proposalIndex?: string
  proposalId?: string
  tokenAddress?: HexAddress
  onlyActive?: boolean
}

export interface IProposalExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  daoAddresses?: HexAddress[]
  pluginAddress?: HexAddress
  creatorAddress?: HexAddress
  pluginAddresses?: HexAddress[]
  proposalIndex?: string
  incrementalId?: number
  daoInfo?: boolean
  isExecuted?: boolean
  isSubProposal?: boolean
}

export interface IGaugeParams {
  network?: NetworksEnum
  pluginAddress?: HexAddress
  epochId?: string
  status?: 'active' | 'inactive'
}

export interface IGaugeEpochMetricParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  memberAddress?: HexAddress
}

export interface IAssetExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  daoAddresses?: HexAddress[]
  tokenAddress?: HexAddress
  onlyParent?: boolean
}

export interface IDaoExtraParams {
  address?: HexAddress | undefined
  networks?: NetworksEnum[] | undefined
  pluginAddress?: HexAddress | undefined
  memberAddress?: HexAddress | undefined
  excludedDao?:
    | undefined
    | {
        daoAddress: string
        network: NetworksEnum
      }
  excludeDaoId?: string | undefined
}

export interface ILogPluginSetupProcessorParams {
  network: NetworksEnum
  pluginAddress: HexAddress
  event: IEventLogPluginType
}

export interface IPluginExtraParams {
  network: NetworksEnum
  pluginAddress: HexAddress
}

export interface IMemberExtraParams {
  daoAddress?: HexAddress
  network?: NetworksEnum
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  escrowAddress?: HexAddress
  lockManagerAddress?: HexAddress
}

export interface ITransactionExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  daoAddresses?: HexAddress[]
  tokenAddress?: HexAddress
  fromAddress?: HexAddress
  toAddress?: HexAddress
  side?: ITransactionSide
  type?: ITransactionType
  onlyParent?: boolean
}

export interface IExtraQueryData {
  daoAddresses?: HexAddress[]
  memberAddresses?: HexAddress[]
  tokenAddress?: HexAddress
}

export interface ISettingExtraParams {
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  network?: NetworksEnum
  status?: ISettingStatus
}

export interface IPaginationParams {
  search?: string
  startDateProp?: string
  endDateProp?: string
  startDate?: number // in our system date is always seconds
  endDate?: number // in our system date is always seconds
  pageSize?: number
  page?: number
  limit?: number
  skip?: number
  order?: 'asc' | 'desc' | string // asc or desc
  sort?: string // the property to sort by
}

export interface IPaginationMetadata {
  page: number
  pageSize: number
  totalPages: number
  totalRecords: number
}

export interface IPaginatedResult<T> {
  data: T[]
  metadata: IPaginationMetadata
}

export interface IGetPluginsByDaoParams {
  daoAddress: HexAddress
  network: NetworksEnum
  interfaceType?: IPluginInterfaceType
  status?: IPluginStatus | 'all'
  isProcess?: boolean
  isSupported?: boolean
}

export interface IGetPoliciesByDaoParams {
  daoAddress: HexAddress
  daoAddresses?: HexAddress[]
  network: NetworksEnum
  onlyParent?: boolean
}
