import { type ENS, type HexAddress, type NetworksEnum } from './networks'
import { type ITokenType } from '@src/types/token'

export interface IStatusResponse {
  status: string
  appName: string
  nodeVersion: string
  environment: string
  supportedNetworks: NetworksEnum[]
  appVersionPackage: string
  time: string
}

export interface IDelegatesResponse {
  transactionHash: HexAddress
  blockNumber: number
  tokenAddress: HexAddress
  fromDelegate: HexAddress
  toDelegate: HexAddress
  pluginAddress: HexAddress
  daoAddress: HexAddress
  amount: HexAddress
  token: {
    type: ITokenType
    address: HexAddress
    logo: string
    name: string
    decimals: number
    symbol: string
  }
}

export interface IMembersResponse {
  id?: string
  address: HexAddress
  ens: ENS | null
  fromBlockNumber?: number
  votingPower?: string
  toBlockNumber?: number
}

export interface IDaoResponse {
  id: string
  network: NetworksEnum
  transactionHash: HexAddress
  blockNumber: number
  blockTimestamp: number
  address: HexAddress
  implementationAddress: HexAddress
  creatorAddress: HexAddress
  ens: ENS | null
  members: number
  metadataIpfs: string | null
  name: string
  description: string
  avatar: string
  links: string[]
  plugins: {
    transactionHash: HexAddress
    blockNumber: number
    address: HexAddress
    implementationAddress: HexAddress | null
    tokenAddress: string
    pluginSetupRepoAddress: HexAddress
    release: string
    build: string
    subdomain: string
  }[]
  tvlUSD: number
  proposalsCreated: number
  proposalsExecuted: number
  uniqueVoters: number
  votes: number
  hideDao: boolean
}

export interface IPluginResponse {
  id: string
  transactionHash: HexAddress
  blockNumber: number
  network: NetworksEnum
  action: string
  address: HexAddress
  implementationAddress: HexAddress | null
  daoAddress: HexAddress
  tokenAddress: HexAddress | null
  pluginSetupRepoAddress: HexAddress
  sender: HexAddress
  release: string
  build: string
  subdomain: string
}

export interface ISettingResponse {
  fromTxHash: HexAddress
  toTxHash: HexAddress | null
  fromBlockNumber: number
  toBlockNumber: number
  daoAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  settings: {
    minApprovals?: number
    onlyListed?: boolean
    votingMode?: number
    supportThreshold?: number
    minParticipation?: number
    minDuration?: number
    minProposerVotingPower?: string
  }
}

export interface IProposalsResponse {
  id: string
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
  executed: {
    status: boolean
    transactionHash: HexAddress
    blockNumber: number
  }
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
  id: string
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

export interface ITokenResponse {
  id: HexAddress
  network: NetworksEnum
  type: ITokenType
  address: HexAddress
  implementationAddress: HexAddress
  logo: string
  name: string
  symbol: string
  decimals: number
  holders: number
  totalSupply: string
  priceChangeOnDayUsd: string
  priceUsd: string
  lastUpdatedAt: string
}
