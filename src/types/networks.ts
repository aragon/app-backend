import { type WebSocketProvider } from 'ethers'
export type HexAddress = `0x${string}` | string
export type ENS = `${string}.eth`
export type DAO_ENS = `${string}.dao.eth`

export enum IWebSocketStatus {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface ISupportedNetwork {
  provider: WebSocketProvider
  networkName: NetworksEnum
}

export enum SupportedEnsNetworksEnum {
  ethereumMainnet = 'ethereum-mainnet',
}

export enum NetworksEnum {
  ethereumMainnet = 'ethereum-mainnet',
  ethereumSepolia = 'ethereum-sepolia',
  polygonMainnet = 'polygon-mainnet',
  baseMainnet = 'base-mainnet',
  arbitrumMainnet = 'arbitrum-mainnet',
  zksyncSepolia = 'zksync-sepolia',
  zksyncMainnet = 'zksync-mainnet',
  optimismMainnet = 'optimism-mainnet',
  peaqMainnet = 'peaq-mainnet',
  chilizMainnet = 'chiliz-mainnet',
  cornMainnet = 'corn-mainnet',
  avaxMainnet = 'avax-mainnet',
  katanaMainnet = 'katana-mainnet',
}

export enum StatusNetworkEnum {
  healthy = 'healthy',
  maintenance = 'maintenance',
  offline = 'offline',
}

export const TestNetworks = [NetworksEnum.ethereumSepolia]

export interface IBlock {
  provider: WebSocketProvider
  hash: string
  parentHash: string
  number: number
  timestamp: number
  nonce: string
  difficulty: bigint
  gasLimit: bigint
  gasUsed: bigint
  baseFeePerGas: bigint
  miner: string
  extraData: string
  currentFeeInNextBlock: bigint
  baseFeeInNextBlock: bigint
  transactions: string[]
}
