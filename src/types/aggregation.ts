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

export interface IAggMemberParams {
  memberAddress?: string
}

export interface IAggPluginParams {
  daoAddress?: string
  pluginAddress?: string
  network?: string
  status?: IPluginStatus
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
  network?: string
  memberAddress?: string
}

export interface IAggMemberBalanceProjectFields {
  amount?: 1
  votingPower?: 1
}
