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
