import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { ITokenMetrics } from '@src/types/covalent'
import { type ITokenType } from '@src/types/token'

export interface IProviderAsset {
  contractAddress: HexAddress
  tokenBalance: string
}

export interface ITokenDetailsProvider {
  fetchTokenDetails: (
    tokenTypeInfo: ITokenProviderInfoArg,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ) => Promise<ITokenProviderInfo>
}

export interface IAccountBalancesProvider {
  getAccountBalances: (address: HexAddress, network: NetworksEnum) => Promise<IProviderAsset[]>
}

export interface ITokenProviderInfo {
  tokenDetails: {
    address: HexAddress
    name: string
    symbol: string
    decimals: number
    logo?: string
    priceUsd?: string
    type?: ITokenType
    totalSupply?: string
    totalHolders?: number
    priceChangeOnDayUsd?: string
  }
  tokenMetrics: ITokenMetrics
}

export interface ITokenProviderInfoArg {
  type: ITokenType
  isGovernance: boolean
}
