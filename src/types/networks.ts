export type HexAddress = `0x${string}`
export type ENS = `${string}.eth`

export type INetworks = keyof typeof NetworksEnum

export enum NetworksEnum {
  mainnet = 'mainnet',
  goerli = 'goerli',
  sepolia = 'sepolia',
  mumbai = 'mumbai',
  polygon = 'polygon',
  base = 'base',
  baseGoerli = 'baseGoerli',
  arbitrum = 'arbitrum',
  arbitrumGoerli = 'arbitrumGoerli',
}

export enum StatusNetworkEnum {
  healthy = 'healthy',
  maintenance = 'maintenance',
  offline = 'offline',
}

export const TestNetworks = [
  NetworksEnum.goerli,
  NetworksEnum.sepolia,
  NetworksEnum.mumbai,
  NetworksEnum.arbitrumGoerli,
  NetworksEnum.baseGoerli,
]
