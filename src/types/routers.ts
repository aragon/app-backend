import { type ENS, type HexAddress, type NetworksEnum } from './networks'
import { type ITokenType } from '@src/types/token'
import { type IActionMetadata } from '@src/types/proposalAction'
import { type ITransferSide, type ITransferType } from '@src/types/transfer'
import { type IReportResultType } from '@src/types/plugin'
import type Router from '@koa/router'

export interface VersionedRouter {
  v1: Router
  v2?: Router
  latest: Router
}

export interface IStatusResponse {
  status: string
  appName: string
  service: string
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
  from: {
    address: HexAddress
    ens: ENS
    avatar: string
  }
  to: {
    address: HexAddress
    ens: ENS
    avatar: string
  }
  side: ITransferSide
  type: ITransferType
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
  pluginSubdomain: string
  pluginAddress: HexAddress
  tokenAddress: HexAddress
  daoAddress: HexAddress
  votingPower?: string
  tokenBalance?: string
  currentDelegate?: HexAddress | null
  metrics: {
    firstActivity?: number
    lastActivity?: number
    delegateReceivedCount: number
    voteCount: number
    proposalCount: number
  }
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
  isHidden: boolean
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
  tokenAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  minApprovals?: number
  onlyListed?: boolean
  votingMode?: number
  supportThreshold?: number
  minParticipation?: number
  minDuration?: number
  minProposerVotingPower?: string
}

export interface IVoteResponse {
  id: string
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  pluginAddress: HexAddress
  daoAddress: HexAddress
  proposalId: number
  member: {
    address: HexAddress
    ens: ENS
    avatar: string
  }
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
  proposalInfo: {
    title: string
    description: string
    summary: string
    metadataUri: string
    resources: string[]
    media: string
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
    metadata: IActionMetadata
  }
  media: {
    header: string | null
    logo: string | null
  }
  daoDetails: {
    name: string
    avatar: string
    description: string
    address: ENS
    links: string[]
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
  priceUsd: string
  lastUpdatedAt: string
}

export interface ITransactionIndexingStatusResponse {
  isProcessed: boolean
  slug?: string
  stage?: number
  pluginAddress?: string
  resultType?: IReportResultType
}
