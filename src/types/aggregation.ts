import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type IPluginRawStatus, type IPluginStatus, type ISettingStatus } from '@src/types/plugin'
import { type ITransferSide, type ITransferType } from '@src/types/transfer'

export interface IQueryGetPlugin {
  transactionHash: HexAddress
  blockNumber: number
  network: NetworksEnum
  address: string
  daoAddress: HexAddress
  tokenAddress: HexAddress
  preparedSetupId: string
  appliedSetupId: string
  pluginSetupRepoAddress: HexAddress
  sender: HexAddress
  release: string
  build: string
  action: IPluginRawStatus
  permissions: any[]
  subdomain: string
}

export interface IAggPluginSlugParams {
  pluginAddress?: string
  network: string
}

export interface IAggTokenParams {
  address?: string
  network: string
}

export interface IAggDaoParams {
  address: string
  network?: string
}

export interface IAggDaoProjectFields {
  _id?: 0 | 1
  id?: 0 | 1
  isActive?: 1
  isSupported?: 1
  network?: 1
  transactionHash?: 1
  blockNumber?: 1
  blockTimestamp?: 1
  address?: 1
  implementationAddress?: 1
  creatorAddress?: 1
  ens?: 1
  subdomain?: 1
  metadataIpfs?: 1
  name?: 1
  description?: 1
  avatar?: 1
  version?: 1
  metrics?: 1
  links?: 1
}

export interface IAggTokenProjectFields {
  _id?: 0 | 1
  id?: 0 | 1
  network?: 1
  transactionHash?: 1
  blockNumber?: 1
  type?: 1
  address?: 1
  implementationAddress?: 1
  logo?: 1
  skipFetchRate?: 1
  name?: 1
  symbol?: 1
  decimals?: 1
  isGovernance?: 1
  hasDelegate?: 1
  underlying?: 1
  holders?: 1
  totalSupply?: 1
  priceUsd?: 1
  lastUpdatedAt?: 1
  mintableByDao?: 1
}

export interface IAggProposalParams {
  proposalIndex?: string | string[]
  pluginAddress?: string | string[]
  network?: string
  as?: string
}

export interface IAggDaoMemberMappingParams {
  tokenAddress?: string
  memberAddress?: string
  daoAddress?: string
  pluginAddress?: string
  network?: string
}

export interface IAggSettingParams {
  pluginAddress?: string
  status?: ISettingStatus
  network: string
}

export interface IAggSettingProjectFields {
  _id?: 0 | 1
  id?: 0 | 1
  transactionHash?: 1
  blockNumber?: 1
  blockTimestamp?: 1
  network?: 1
  daoAddress?: 1
  pluginAddress?: 1
  pluginSubdomain?: 1
  tokenAddress?: 1
  onlyListed?: 1
  minApprovals?: 1
  votingMode?: 1
  supportThreshold?: 1
  minParticipation?: 1
  minDuration?: 1
  minProposerVotingPower?: 1
  stages?: 1
  votingEscrow?: 1
}

export interface IAggMemberParams {
  memberAddress?: string
}

export interface IAggMemberTransactionParams {
  network?: string
  memberAddress?: string
  tokenAddress?: string
  type?: ITransferType
  side?: ITransferSide
}

export interface IAggPluginParams {
  addresses?: string | string[]
  daoAddress?: string
  pluginAddress?: string
  network: string | undefined
  status?: IPluginStatus
}

export interface IAggPluginInclude {
  settings: boolean
  token: boolean
}

export interface IAggPluginProjectFields {
  _id?: 0 | 1
  transactionHash?: 1
  blockNumber?: 1
  blockTimestamp?: 1
  network?: 1
  address?: 1
  name: 1
  description: 1
  processKey: 1
  slug: 1
  links: 1
  implementationAddress?: 1
  status?: 1
  isSupported: 1
  interfaceType: 1
  tokenAddress?: 1
  metadataIpfs?: 1
  release?: 1
  build?: 1
  subdomain?: 1
  isProcess: 1
  isBody: 1
  isSubPlugin: 1
  totalStages: 1
  subPlugins: 1
  stageIndex: 1
  parentPlugin: 1
  permissions?: 1
  uninstalled?: 1
  createdAt?: 1
  updatedAt?: 1
  votingEscrow?: 1
}

export interface IAggMemberTransactionProjectFields {
  network?: 1
  transactionHash?: 1
  transactionIndex?: 1
  logIndex?: 1
  blockNumber?: 1
  blockTimestamp?: 1
  tokenAddress?: 1
  address?: 1
  from?: 1
  to?: 1
  side?: 1
  type?: 1
  amount?: 1
  tokenId?: 1
  memberBalance?: 1
  memberVotingPower?: 1
}

export interface IAggMemberProjectFields {
  address?: 1
  ens?: 1
  avatar?: 1
}

export interface IAggMemberBalanceParams {
  tokenAddress?: string
  network: string
  memberAddress?: string
}

export interface IAggMemberBalanceProjectFields {
  amount?: 1
  votingPower?: 1
}

export interface IAggMemberMetricsParams {
  network?: string
  memberAddress?: string
  pluginAddress?: string
}

export interface IAggMemberMetricsProjectFields {
  _id?: 0 | 1
  lastActivity?: 1
  firstActivity?: 1
  delegateReceivedCount?: 1
  voteCount?: 1
  proposalCount?: 1
}
