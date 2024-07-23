import { ITokenMetadata } from '@src/types/token'

export enum ProposalActionType {
  Transfer = 'Transfer',
  Unknown = 'Unknown',
  Mint = 'Mint',
  MultisigAddMembers = 'MultisigAddMembers',
  MultisigRemoveMembers = 'MultisigRemoveMembers',
  MetadataUpdate = 'MetadataUpdate',
  UpdateMultiSigSettings = 'UpdateMultiSigSettings',
  UpdateVoteSettings = 'UpdateVoteSettings',
}

export interface IRawAction {
  to: string
  data: string
  value: any
}

export enum KnownActionSignature {
  Transfer = 'transfer(address,uint256)',
  TransferFrom = 'transferFrom(address,address,uint256)',
  SafeTransferFrom = 'safeTransferFrom(address,address,uint256)',
  Mint = 'mint(address,uint256)',
  MultisigAddMembers = 'addAddresses(address[])',
  MultisigRemoveMembers = 'removeAddresses(address[])',
  MetadataUpdate = 'setMetadata(bytes)',
  UpdateMultiSigSettings = 'updateMultisigSettings(tuple)',
  UpdateVoteSettings = 'updateVotingSettings(tuple)',
}

export interface ITransfacerActionMeta {
  token: ITokenMetadata
  from: string
  to: string
  value: string
}

export interface IMintActionMeta {
  token: ITokenMetadata
  to: string
  value: string
}

export interface IAddMembersActionMeta {
  addresses: string[]
}

export interface IMultiSigSettingsMeta {
  onlyListed: boolean
  minApprovals: number
}

export interface IVoteSettingsMeta {
  votingMode: number
  supportThreshold: number
  minParticipation: number
  minDuration: number
  minProposerVotingPower: string
}

export type IActionMetadata =
  | ITransfacerActionMeta
  | IMintActionMeta
  | IAddMembersActionMeta
  | IMultiSigSettingsMeta
  | IVoteSettingsMeta
