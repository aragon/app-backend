export enum AnkrNetworksEnum {
  ethereumMainnet = 'eth',
  ethereumSepolia = 'eth_sepolia',
  polygonMainnet = 'polygon',
  baseMainnet = 'base',
  arbitrumMainnet = 'arbitrum',
  optimismMainnet = 'optimism',
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
