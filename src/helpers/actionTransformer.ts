import { type IProposalAction, type IProposalRawAction, ProposalActionType } from '@types'
import type Proposal from '@models/schema/proposal'

const ActionTransformer = {
  _handleAction(action: IProposalRawAction, dbData: Partial<Proposal>) {
    const regex = /\(([^)]+)\)/
    const match = action.functionName.match(regex)
    const parameterTypes = match ? match[1].split(',') : []

    const parameters = parameterTypes.map((param, index) => {
      return {
        type: param,
        value: action.decoded[index],
      }
    })

    let proposalAction: IProposalAction = {
      from: daoAddress,
      to: action.to,
      data: action.data,
      value: action.value,
      type: action.type,
      inputData: {
        function: action.functionName,
        contract: action.contractName,
        parameters,
      },
    }

    if (action.type === ProposalActionType.Transfer) {
      return this._handleTransfer(action)
    }

    if (action.type === ProposalActionType.Mint) {
      return this._handleMint(action)
    }

    if (action.type === ProposalActionType.MultisigAddMembers) {
      return this._handleAddMember(action)
    }

    if (action.type === ProposalActionType.MultisigRemoveMembers) {
      return this._handleRemoveMember(action)
    }

    if (action.type === ProposalActionType.UpdateMultiSigSettings) {
      return this._handleMultiSigSetting(action)
    }

    if (action.type === ProposalActionType.UpdateVoteSettings) {
      return this._handleTokenVotingSetting(action)
    }

    if (action.type === ProposalActionType.MetadataUpdate) {
      return this._handleMetadataUpdate(action)
    }
  },
  _handleTransfer(action: IProposalRawAction) {},
  _handleMint(action: IProposalRawAction) {},
  _handleMultiSigSetting(action: IProposalRawAction) {},
  _handleTokenVotingSetting(action: IProposalRawAction) {},
  _handleAddMember(action: IProposalRawAction) {},
  _handleRemoveMember(action: IProposalRawAction) {},
  _handleMetadataUpdate(action: IProposalRawAction) {},
}

export default ActionTransformer
