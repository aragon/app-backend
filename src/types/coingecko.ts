export interface ITokenCoinGecko {
  usd: number
  usd_24h_change: number
}

export type ITokenCoinGeckoResponse = Record<string, ITokenCoinGecko>

export interface ITokenPriceCoinGecko {
  usd: number
  usd24hChange: number
}
