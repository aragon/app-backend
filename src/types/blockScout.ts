import { type ITokenType } from '@src/types/token'

export interface ITokenFullDetails {
  address?: string | null
  name: string | null
  symbol: string | null
  decimals: number
  totalSupply?: string
  totalHolders?: number
  logo?: string | null
  type?: ITokenType
  priceUsd?: string
}

export enum IBlockScoutAddressType {
  ADDRESS = 'address',
  TOKEN = 'token',
}
