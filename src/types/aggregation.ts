import { NetworksEnum } from '@src/types/networks'

export interface IQueryGetPlugin {
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  address: string
  daoAddress: string
  tokenAddress: string
  preparedSetupId: string
  appliedSetupId: string
  pluginRepoAddress: string
  sender: string
  release: string
  build: string
  permissions: any[]
  subdomain: string
}

export interface IHistoryMember {
  network: string
  fromBlockNumber: number
  fromTxHash: string
  toBlockNumber: number | null
  toTxHash: string | null
  pluginAddress: string
  pluginSubdomain: string
  tokenAddress: string
  daoAddress: string
  votingPower?: string
  delegateFromAddress: string
  delegateToAddress: string
}

export interface IQueryGetMemberHistory {
  _id: string
  address: string
  history: IHistoryMember[]
}
