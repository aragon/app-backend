import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ITokenInfo {
  type: ITokenType
  proxy: boolean
  implementationAddress: string | null
  isGovernance: boolean
  hasUnderlying: boolean
  hasBalanceOfERC20: boolean
  hasBalanceOfERC777: boolean
  hasName: boolean
  hasSymbol: boolean
  hasDecimals: boolean
  hasTotalSupply: boolean
  hasDelegate: boolean
}

export interface ITokenRate {
  priceUsd: string
  address: HexAddress
  type: ITokenType
  logo: string
  decimals: number
  symbol: string
  name: string
  lastUpdatedAt: Date
  skipFetchRate?: boolean
}

export interface ITokenDetails {
  address: HexAddress
  name: string
  symbol: string
  decimals: number
  logo?: string | undefined
  priceUsd?: string
  type?: ITokenType
  totalSupply?: string
  totalHolders?: number
  lastUpdatedAt?: any
}

export interface IToken {
  address: HexAddress
  network: NetworksEnum
  type: ITokenType
  logo: string
  name: string
  symbol: string
  decimals: number
  holders: number
  totalSupply: string
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
  native = 'native',
  escrowAdapter = 'escrowAdapter',
  unknown = 'unknown',
}

export interface ITokenMetadata {
  name: string
  address: string
  symbol: string
  decimals: number
  logo: string
  type: ITokenType
}

export interface ITokenUpdate {
  priceUsd: string
  totalHolders: number
  totalSupply: string
}

export interface IMemberTokenInfo {
  balance: string
  votingPower: string
  currentDelegate: HexAddress | null
}

export enum IClockMode {
  BlockNumber = 'blocknumber',
  Timestamp = 'timestamp',
}

export enum TokenSyncTagName {
  Default = 'default',
  Delegation = 'delegation-event',
  Transfer = 'transfer-event',
  TokenHolders = 'token-holders',
}
