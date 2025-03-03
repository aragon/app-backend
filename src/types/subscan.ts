import { type HexAddress } from '@src/types/networks'

export interface ISubScanTokenBalance {
  contractAddress: HexAddress
  tokenBalance: string
}

export interface ISubScanAccountBalances {
  native: string
  erc20: ISubScanTokenBalance[]
}

export interface ISubScanRawContractDetails {
  value: string
  address: HexAddress
  decimals: number
}

export interface ISubScanAssetTransfer {
  blockNum: number
  from: HexAddress
  to: HexAddress
  uniqueId: string
  blockTimestamp: number
  value: string
  hash: string
  category: 'external' | 'erc20'
  rawContract?: ISubScanRawContractDetails
}
