export interface AnkrAsset {
  blockchain: string
  tokenName: string
  tokenSymbol: string
  tokenDecimals: number
  tokenType: string
  contractAddress?: string
  holderAddress: string
  balance: string
  balanceRawInteger: string
  balanceUsd: string
  tokenPrice: string
  thumbnail?: string
}

export interface AnkrAccountBalance {
  totalBalanceUsd: string
  totalBalance?: string
  totalCount: number
  assets: AnkrAsset[]
}

export interface AnkrBalanceResult {
  tvl: string
  assets: AnkrAsset[]
  error?: boolean
}
