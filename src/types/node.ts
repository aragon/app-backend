import { type Alchemy } from 'alchemy-sdk'

export interface IAlchemyConfig {
  providerType: IProviderType
  alchemyApiKey?: string
  fromBlock: number
  confirmationBlocks: number
  intervalBlockTime: number
}

export enum IProviderType {
  ALCHEMY = 'alchemy', // must be lowercase
  ARAGON = 'aragon', // must be lowercase
}

export enum IConnectionType {
  WS = 'ws', // must be lowercase
  RPC = 'rpc', // must be lowercase
  NFT = 'nft', // must be lowercase
}

export interface IAragonNodeConfig extends Omit<IAlchemyConfig, 'alchemyApiKey'> {
  wsEndpoint: string
  rpcEndpoint: string
}

export interface INodeConnection {
  rpc: any
  ws: any
  api?: any
}

export interface IAlchemyNodeConnection extends Alchemy {
  rpc: any
}

export interface IProviderProxy {
  alchemy?: IAlchemyNodeConnection
  aragon?: INodeConnection
}

export interface IRealTimeConfig {
  processingTimeoutMs: number
  maxFailures: number
  circuitBreakerPauseMs: number
  batchWindowMs: number
}
