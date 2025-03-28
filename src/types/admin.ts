export interface IAQueueDao {
  address: string
  network: string
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
