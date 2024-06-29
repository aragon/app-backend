import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { ITransactionCategory } from '@src/types/alchemy'
import { type ITokenType } from '@src/types/token'

export interface ITokenExtraParams {
  network?: NetworksEnum
  type?: ITokenType
}

export interface IVoteExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  proposalId?: number
  memberAddress?: HexAddress
}

export interface IProposalExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  creatorAddress?: HexAddress
}

export interface IAssetExtraParams {
  network?: NetworksEnum
  daoAddress?: HexAddress
}

export interface IDaoExtraParams {
  address?: HexAddress | undefined
  network?: NetworksEnum | undefined
  pluginAddress?: HexAddress | undefined
}

export interface IMemberExtraParams {
  daoAddress?: HexAddress
  network?: NetworksEnum
  pluginAddress?: HexAddress
  tokenAddress?: HexAddress
  onlyActive?: boolean
}

export interface IDelegateExtraParams {
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
}

export interface ISettingExtraParams {
  daoAddress?: HexAddress
  pluginAddress?: HexAddress
  network?: NetworksEnum
  onlyActive?: boolean
}

export interface IPaginationParams {
  search?: string
  startDate?: Date | string | number
  endDate?: Date | string | number
  pageSize?: number
  page?: number
  order?: string // the property to order by
  sort?: string // asc or desc
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
