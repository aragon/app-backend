import { type HexAddress } from '@src/types/networks'
import { type ITransactionType } from '@src/types/db'

export enum ITransactionCategory {
  External = 'external',
  Internal = 'internal',
  ERC20 = 'erc20',
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
  SpecialNft = 'specialnft',
}

export interface IAlchemyTransferOptions {
  fromBlock?: number | string
  toBlock?: number | string
  fromAddress?: HexAddress
  toAddress?: HexAddress
  category?: ITransactionCategory[]
}

export interface IAlchemyTransferResponse {
  blockNum: number // hex block number
  blockTimestamp: number // timestamp in seconds
  uniqueId: string
  hash: HexAddress
  from: HexAddress
  to: HexAddress
  value: number | null
  erc721TokenId: string | null
  erc1155Metadata: IAlchemyERC1155Metadata[]
  tokenId: string | null
  asset: string | null
  category: ITransactionCategory
  rawContract: IAlchemyRawContract
  type?: ITransactionType
}

export interface IAlchemyERC1155Metadata {
  tokenId: string
  value: string
}

export interface IAlchemyRawContract {
  value: HexAddress | null
  address: HexAddress | null
  decimal: HexAddress | null
  type: string | null
  logo: string | null
  priceUpdatedAt: number | null
}
