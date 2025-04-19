import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { ITransactionCategory } from '@src/types/alchemy'
import { type ITokenType } from '@src/types/token'
import { type ITransferSide, type ITransferType } from '@src/types/transfer'
import { type ISettingStatus } from '@src/types/plugin'

export interface ITokenExtraParams {
  network?: NetworksEnum
  type?: ITokenType
  isGovernance?: boolean
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
  network: HexAddress
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
}

export interface IProposalExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  creatorAddress?: HexAddress
  proposalIndex?: string
  incrementalId?: number
  daoInfo?: boolean
}

export interface IAssetExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  tokenAddress?: HexAddress
}

export interface IDaoExtraParams {
  address?: HexAddress | undefined
  networks?: [NetworksEnum] | [] | undefined
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

export interface IMemberExtraParams {
  daoAddress?: HexAddress
  network?: NetworksEnum
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
}

export interface IDelegateExtraParams {
  type?: ITransferType
  side?: ITransferSide
  excludeZeroAddress?: boolean
  memberAddress?: HexAddress
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  network?: NetworksEnum
}

export interface ITransactionExtraParams {
  category?: ITransactionCategory
  network?: NetworksEnum
  daoAddress?: HexAddress
  tokenAddress?: HexAddress
  fromAddress?: HexAddress
  toAddress?: HexAddress
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
