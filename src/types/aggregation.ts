import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type IPluginRawStatus, type IPluginStatus } from '@src/types/plugin'

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

export interface IAggTokenParams {
  address?: string
  network: string
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
  holders?: 1
  totalSupply?: 1
  priceChangeOnDayUsd?: 1
  priceUsd?: 1
  lastUpdatedAt?: 1
}

export interface IAggDaoMemberMappingParams {
  memberAddress?: string
  daoAddress?: string
  pluginAddress?: string
  network?: string
}

export interface IAggSettingParams {
  pluginAddress?: string
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
}

export interface IAggMemberParams {
  memberAddress?: string
}

export interface IAggPluginParams {
  daoAddress?: string
  pluginAddress?: string
  network: string
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
  implementationAddress?: 1
  status?: 1
  tokenAddress?: 1
  release?: 1
  build?: 1
  subdomain?: 1
  permissions?: 1
  uninstalled?: 1
  createdAt?: 1
  updatedAt?: 1
}

export interface IAggMemberProjectFields {
  address?: 1
  ens?: 1
  avatar?: 1
  firstActivity?: 1
  lastActivity?: 1
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
