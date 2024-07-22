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
