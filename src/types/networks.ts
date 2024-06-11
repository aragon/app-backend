import { type WebSocketProvider } from 'ethers'
export type HexAddress = `0x${string}`
export type ENS = `${string}.eth`

export type INetworks = keyof typeof NetworksEnum

export interface ISupportedNetwork {
  provider: WebSocketProvider
  networkName: NetworksEnum
}

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
