import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface IToken {
  address: HexAddress
  network: NetworksEnum
  logo: string
  name: string
  symbol: string
  decimals: number
  holders: number
  totalSupply: number
  priceChangeOnDayUsd: number
  priceUsd: string
  lastUpdatedAt: string
  createdAt: string
}

export interface ITokenBalance {
  contractAddress: HexAddress
  contractName: string
  contractTickerSymbol: string
  contractDecimals: number
  nativeToken: boolean
  balance: string
  logoUrl: string
}

export interface TokensBalancesType {
  items: ITokenBalance[]
  updatedAt: string
}

export enum ITokenType {
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
  ERC1155 = 'ERC1155',
  ERC777 = 'ERC777',
  GovernanceERC20 = 'GovernanceERC20',
  unknown = 'unknown',
}

export enum ITokenType {
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
  ERC1155 = 'ERC1155',
  ERC777 = 'ERC777',
  GovernanceERC20 = 'GovernanceERC20',
  unknown = 'unknown',
}
