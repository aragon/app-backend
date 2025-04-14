import { type HexAddress } from '@src/types/networks'
import { type ITransactionType } from '@src/types/db'
import { type ITokenType } from '@src/types/token'
import { type ITransactionCategory } from '@src/types/alchemy'

export interface ISubScanTokenBalance {
  contractAddress: HexAddress
  tokenBalance: string
  decimals: number
  name: string
  symbol: string
}

export interface ISubScanContractCreation {
  address: HexAddress
  transactionHash: string
  blockNumber: number
}

export interface ISubScanNativeTokenInfo {
  address: HexAddress
  decimals: number | null
  name: string | null
  symbol: string | null
  priceUsd: string
  type: ITokenType
  logo: string | null
  totalSupply: string
  totalHolders: number
}

export interface ISubScanTokenInfo {
  address: HexAddress
  decimals: number | null
  name: string | null
  symbol: string | null
  priceUsd: string
  type: ITokenType
  logo: string | null
  lastUpdatedAt: string | null | Date
  totalSupply: string
  totalHolders: number
}

export interface ISubScanRawContractDetails {
  value: string
  address: HexAddress
  decimals: number
  name: string
  symbol: string
  priceUsd: string
}

export interface ISubScanAssetTransfer {
  blockNum: number
  from: HexAddress
  to: HexAddress
  uniqueId: string
  blockTimestamp: number
  type?: ITransactionType
  value: number | null
  hash: string
  erc721TokenId?: string | null
  erc1155Metadata?: any | null
  tokenId?: string | null
  category: ITransactionCategory
  rawContract?: ISubScanRawContractDetails
}
