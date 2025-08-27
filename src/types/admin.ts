import { type NetworksEnum } from '@src/types/networks'

export interface IAQueueToken {
  address: string
  network: string
}

export interface IAQueueDao {
  address: string
  network: string
}

export interface IAVisibilityStatusParams {
  address: string
  network: string
  status: boolean
}

export interface IAQueueProposal {
  pluginAddress: string
  proposalIndex: string
  network: string
}

export enum IJwtTokenType {
  admin = 'admin',
}

export enum IJwtAuthType {
  auth = 'auth',
}

export interface IARewardAllocation {
  address: string
  amount: string
}

export interface IAAddMembersListParams {
  campaignId: string
  pluginAddress: string
  network: NetworksEnum
  rewards: IARewardAllocation[]
}
