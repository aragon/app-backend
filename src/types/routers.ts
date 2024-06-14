import { type ENS, type INetworks, type NetworksEnum } from './networks'

export interface IStatusResponse {
  status: string
  appName: string
  nodeVersion: string
  environment: string
  supportedNetworks: INetworks[]
  appVersionPackage: string
  time: string
}

export interface IMembersResponse {
  address: string
  ens: string | null
  votingPower?: string
  fromBlockNumber: number
  toBlockNumber?: number
}

export interface IDaoResponse {
  entityId: string
  network: NetworksEnum
  transactionHash: string
  blockNumber: number
  blockTimestamp: number
  permalink: string
  address: string
  implementationAddress: string
  creatorAddress: string
  ens: ENS | null
  members: number
  metadataIpfs: string | null
  name: string
  description: string
  avatar: string
  links: string[]
  plugins: {
    transactionHash: string
    blockNumber: number
    address: string
    implementationAddress: string | null
    tokenAddress: string
    pluginSetupRepoAddress: string
    release: string
    build: string
    subdomain: string
  }[]
  tvlUSD: string
  proposalsCreated: number
  proposalsExecuted: number
  uniqueVoters: number
  votes: number
  hideDao: boolean
}

export interface IPluginResponse {
  entityId: string
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  action: string
  address: string
  implementationAddress: string | null
  daoAddress: string
  tokenAddress: string | null
  pluginSetupRepoAddress: string
  sender: string
  release: string
  build: string
  subdomain: string
}

export interface IProposalResponse {
  entityId: string
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  pluginAddress: string
  daoAddress: string
  proposalId: number
  creatorAddress: string
  startDate: number
  endDate: number
  metadataUri: string
  title: string
  description: string | null
  summary: string
  settings: {
    fromTxHash: string
    toTxHash: string | null
    fromBlockNumber: number
    toBlockNumber: number | null
    minApprovals: number
    onlyListed: boolean
  }
  media: {
    header: string | null
    logo: string | null
  }
}

export interface IAssetResponse {
  network: NetworksEnum
  daoAddress: string
  tokenAddress: string
  amount: string
  token: {
    address: string
    symbol: string
    name: string
    type: string
    logo: string
    decimals: number
    priceChangeOnDayUsd: string
    priceUsd: string
  }
  amountUsd: string
}

export interface ITransactionResponse {
  entityId: string
  transactionHash: string
  blockNumber: number
  network: string
  type: string
  category: string
  fromAddress: string
  toAddress: string
  value: string
  tokenAddress: string
  daoAddress: string
  token: {
    address: string
    symbol: string
    name: string
    type: string
    logo: string
    decimals: number
    priceChangeOnDayUsd: string
    priceUsd: string
  }
}
