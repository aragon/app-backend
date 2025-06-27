export enum AnkrNetworksEnum {
  ethereumMainnet = 'eth',
  ethereumSepolia = 'eth-sepolia',
  polygonMainnet = 'polygon',
  baseMainnet = 'base',
  arbitrumMainnet = 'arbitrum',
  zksyncSepolia = 'zksync_era-sepolia',
  zksyncMainnet = 'zksync_era',
  optimismMainnet = 'optimism',
  chilizMainnet = 'chiliz',
  cornMainnet = 'corn_maizenet',
}

export interface AnkrTokenHoldersResponse {
  jsonrpc: string
  id: number
  result: {
    blockchain: string
    contractAddress: string
    tokenDecimals: number
    holderCountHistory: Array<{
      holderCount: number
      totalAmount: string
      totalAmountRawInteger: string
      lastUpdatedAt: string
    }>
  }
}
