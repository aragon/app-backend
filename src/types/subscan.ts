import { type HexAddress } from '@src/types/networks'
import { type ITransactionType } from '@src/types/db'

export interface ISubScanTokenBalance {
  contractAddress: HexAddress
  tokenBalance: string
  decimals: number
  name: string
  symbol: string
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
  value: string
  hash: string
  category: 'external' | 'erc20'
  rawContract?: ISubScanRawContractDetails
}
