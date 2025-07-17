import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface DaoResourceLink {
  name: string
  url: string
}

export interface IMetadata {
  name?: string | null
  description?: string | null
  avatar?: string | null
  links?: DaoResourceLink[]
  stageNames?: string[]
  processKey?: string | null
}

export interface IProposalMetadata {
  title?: string | null
  summary?: string | null
  description?: string | null
  resources?: {
    url?: string
    name?: string
  }[]
  media?: {
    header?: string | null
    logo?: string | null
  }
}

export interface IPermission {
  operation: number
  where: string
  who: string
  condition: string
  permissionId: string
}

export enum IOperationType {
  Call = 0,
  Delegate = 1,
}

export interface IProposalSPPOnChain {
  allowFailureMap: string
  creator: HexAddress
  lastStageTransition: number
  metadata: string
  actions: IProposalActionOnChain[]
  currentStage: number
  stageConfigIndex: number
  executed: boolean
  targetConfig: {
    target: HexAddress
    operation: IOperationType
  }
  parameters?: any
}

export interface IProposalTokenVotingOnChain {
  open: boolean
  executed: boolean
  parameters: {
    votingMode: number
    supportThreshold: number
    startDate: number
    endDate: number
    snapshotBlock: number
    minVotingPower: number
  }
  tally: {
    abstain: 'abstain'
    yes: 'yes'
    no: 'no'
  }
  actions: IProposalActionOnChain[]
  allowFailureMap: string
}

export interface IProposalMultisigOnChain {
  executed: boolean
  approvals: number
  parameters: {
    minApprovals: number
    snapshotBlock: number
    startDate: number
    endDate: number
  }
  actions: IProposalActionOnChain[]
  allowFailureMap: string
}

export interface IProposalActionOnChain {
  to: string
  value: number
  data: string
}

export type IProposalOnChain = IProposalTokenVotingOnChain | IProposalMultisigOnChain | IProposalSPPOnChain | null

export interface IDaoMemberMappingData {
  network: NetworksEnum
  memberAddress: HexAddress
  pluginAddress: HexAddress
  tokenAddress?: HexAddress
}
