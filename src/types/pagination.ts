import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { ITransactionCategory } from '@src/types/alchemy'
import { type ITokenType } from '@src/types/token'
import { type ITransferSide, type ITransferType } from '@src/types/transfer'

export interface ITokenExtraParams {
  network?: NetworksEnum
  type?: ITokenType
}

export interface IVoteExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  memberAddress?: HexAddress
  includeInfo?: boolean
}

export interface IPairParams {
  daoId?: string
  ens?: string
  proposalId?: string
}

export interface IProposalExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  creatorAddress?: HexAddress
  proposalIndex?: number
  daoInfo?: boolean
}

export interface IAssetExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  tokenAddress?: HexAddress
}

export interface IDaoExtraParams {
  address?: HexAddress | undefined
  network?: NetworksEnum | undefined
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

export interface ISettingExtraParams {
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  network?: NetworksEnum
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
