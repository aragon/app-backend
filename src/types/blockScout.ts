export interface ITokenFullDetails {
  address?: string | null
  name: string | null
  symbol: string | null
  decimals: number
  totalSupply?: string
  totalHolders?: number
  logo?: string | null
  type?: string
  priceUsd?: string
}

export enum IBlockScoutAddressType {
  ADDRESS = 'address',
  TOKEN = 'token',
}
