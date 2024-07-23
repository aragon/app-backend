import { type ENS, type HexAddress, type NetworksEnum } from './networks'
import { type ITokenType } from '@src/types/token'
import { IPluginAction, type IPluginSubdomain } from '@src/types/plugin'
import { IActionMetadata } from '@src/types/proposalAction'

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
  network: NetworksEnum
  transactionHash: HexAddress
  blockNumber: number
  tokenAddress: HexAddress
  fromDelegate: HexAddress
  toDelegate: HexAddress
  pluginAddress: HexAddress
  daoAddress: HexAddress
  amount: string
  token: {
    network: NetworksEnum
    type: ITokenType
    address: HexAddress
    logo: string
    name: string
    decimals: number
    symbol: string
  }
}

export interface IMembersResponse {
  network: NetworksEnum
  fromBlockNumber?: number
  fromTxHash?: HexAddress
  address: HexAddress
  ens: ENS
  pluginSubdomain: IPluginSubdomain
  pluginAddress: HexAddress
  tokenAddress: HexAddress
  daoAddress: HexAddress
  votingPower?: string
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
  ens: ENS | undefined
  subdomain: ENS | null
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
  metrics: {
    proposalsCreated: number
    proposalsExecuted: number
    uniqueVoters: number
    votes: number
    members: number
  }
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

export interface IVoteResponse {
  id: string
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  pluginAddress: HexAddress
  daoAddress: HexAddress
  proposalId: number
  memberAddress: HexAddress
  voteOption?: number
  votingPower?: string
  token: {
    network: NetworksEnum
    type: ITokenType
    address: HexAddress
    logo: string
    name: string
    decimals: number
    symbol: string
  }
}

export interface IProposalsResponse {
  id: string
  transactionHash: HexAddress
  blockNumber: number
  network: NetworksEnum
  pluginAddress: HexAddress
  daoAddress: HexAddress
  proposalId: number
  creatorAddress: HexAddress
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
    fromTxHash: HexAddress
    toTxHash: HexAddress
    fromBlockNumber: number
    toBlockNumber: number | null
    minApprovals?: number
    onlyListed?: boolean
    votingMode?: number
    supportThreshold?: number
    minParticipation?: number
    minDuration?: number
    minProposerVotingPower?: string
  }
  actions: {
    to: HexAddress
    value: string
    data: HexAddress
    functionName: string
    textSignature: string
    decoded: any[]
    contractName: string
    type: IPluginAction
    metadata: IActionMetadata
  }
  media: {
    header: string | null
    logo: string | null
  }
}

export interface IAssetResponse {
  network: NetworksEnum
  daoAddress: HexAddress
  tokenAddress: HexAddress
  amount: string
  token: {
    network: NetworksEnum
    address: HexAddress
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
    network: NetworksEnum
    address: HexAddress
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
