export interface ITokenCoinGecko {
  usd: number
  usd_24h_change: number
}

export interface ITokenCoinGeckoResponse {
  [address: string]: ITokenCoinGecko
}

export interface ITokenPriceCoinGecko {
  usd: number
  usd24hChange: number
}
