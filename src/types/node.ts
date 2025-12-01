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
  DRPC = 'drpc', // must be lowercase
}

export enum IConnectionType {
  RPC = 'rpc', // must be lowercase
  NFT = 'nft', // must be lowercase
}

export interface IAragonNodeConfig extends Omit<IAlchemyConfig, 'alchemyApiKey'> {
  rpcEndpoint: string
}

export interface IDrpcConfig {
  providerType: IProviderType
  drpcApiKey: string
  fromBlock: number
  confirmationBlocks: number
  intervalBlockTime: number
}

export interface INodeConnection {
  rpc: any
}

export interface IAlchemyNodeConnection {
  rpc: any
}

export interface IDrpcNodeConnection {
  rpc: any
}

export interface IProviderProxy {
  alchemy?: IAlchemyNodeConnection
  aragon?: INodeConnection
  drpc?: IDrpcNodeConnection
}
