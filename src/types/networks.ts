import { type WebSocketProvider } from 'ethers'
export type HexAddress = `0x${string}` | string
export type ENS = `${string}.eth`

export type INetworks = keyof typeof NetworksEnum

export interface ISupportedNetwork {
  provider: WebSocketProvider
  networkName: NetworksEnum
}

export enum SupportedEnsNetworksEnum {
  ethereumMainnet = 'ethereumMainnet',
}

export enum NetworksEnum {
  ethereumMainnet = 'ethereumMainnet',
  ethereumSepolia = 'ethereumSepolia',
  polygonMainnet = 'polygonMainnet',
  baseMainnet = 'baseMainnet',
  arbitrumMainnet = 'arbitrumMainnet',
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
