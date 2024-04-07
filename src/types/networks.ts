export type HexAddress = `0x${string}`
export type ENS = `${string}.eth`

export type INetworks = keyof typeof NetworksEnum

export enum NetworksEnum {
  mainnet = 'mainnet',
  sepolia = 'sepolia',
  polygon = 'polygon',
  base = 'base',
  arbitrum = 'arbitrum',
}

export enum StatusNetworkEnum {
  healthy = 'healthy',
  maintenance = 'maintenance',
  offline = 'offline',
}

export const TestNetworks = [NetworksEnum.sepolia]
