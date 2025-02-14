export interface ITokenFullDetails {
  address?: string | null
  name: string | null
  symbol: string | null
  decimals: number
  totalSupply?: string
  holders?: number
  logo: string | null
  type?: string
  priceUsd: string
}
