import { type IProposalAction, type IProposalRawAction, ProposalActionType } from '@types'
import type Proposal from '@models/schema/proposal'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'

const ActionTransformer = {
  async handleAction(action: IProposalRawAction, dbData: Proposal) {
    const proposalAction: IProposalAction = {
      from: dbData.daoAddress,
      to: action.to,
      data: action.data,
      value: action.value,
      type: action.type,
      inputData: null,
    }

    const regex = /\(([^)]+)\)/

    if (action.textSignature) {
      const match = action.textSignature.match(regex)
      const parameterTypes = match ? match[1].split(',') : []

      const parameters = parameterTypes.map((param, index) => ({
        type: param,
        value: action.decoded[index],
      }))

      proposalAction.inputData = {
        function: action.functionName,
        contract: action.contractName,
        parameters,
      }
    }

    switch (action.type) {
      case ProposalActionType.Transfer:
        return this._handleTransfer(proposalAction, action, dbData)
      case ProposalActionType.Mint:
        return this._handleMint(proposalAction, action, dbData)
      case ProposalActionType.MultisigAddMembers:
        return this._handleAddMember(proposalAction, action, dbData)
      case ProposalActionType.MultisigRemoveMembers:
        return this._handleRemoveMember(proposalAction, action, dbData)
      case ProposalActionType.UpdateMultiSigSettings:
        return this._handleMultiSigSetting(proposalAction, action, dbData)
      case ProposalActionType.UpdateVoteSettings:
        return this._handleTokenVotingSetting(proposalAction, action, dbData)
      case ProposalActionType.MetadataUpdate:
        return this._handleMetadataUpdate(proposalAction, action, dbData)
      default:
        return proposalAction
    }
  },

  async _handleTransfer(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const dbToken = await Models.Token.findByTokenAddressAndNetwork(dbData.network, rawAction.metadata.token.address)

    return {
      ...action,
      sender: { address: rawAction.metadata.from },
      receiver: { address: rawAction.metadata.to },
      amount: rawAction.metadata.value,
      token: {
        name: rawAction.metadata.token.name,
        symbol: rawAction.metadata.token.symbol,
        decimals: rawAction.metadata.token.decimals,
        logo: rawAction.metadata.token.logo,
        priceUsd: dbToken ? dbToken.priceUsd : '0',
        address: rawAction.metadata.token.address,
      },
    }
  },

  async _handleMint(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const currentBalance = await Web3Helper.getERC20Balance(
      rawAction.metadata.to,
      rawAction.metadata.token.address,
      rawAction.metadata.token.symbol,
    )

    return {
      ...action,
      receivers: [
        {
          currentBalance,
          newBalance: rawAction.metadata.value,
        },
      ],
      tokenSymbol: rawAction.metadata.token.symbol,
      totalSupply: dbData.token.totalSupply,
      holdersCount: dbData.token.holdersCount,
    }
  },

  async _handleAddMember(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const currentMembers = await Models.LogMember.getMultiSigMemberAtBlockNumber(
      dbData.pluginAddress,
      dbData.blockNumber,
      dbData.network,
    )

    return {
      ...action,
      members: rawAction.metadata.addresses.map((address: string) => ({ address })),
      currentMembers: currentMembers.members,
    }
  },

  async _handleRemoveMember(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const currentMembers = await Models.LogMember.getMultiSigMemberAtBlockNumber(
      dbData.pluginAddress,
      dbData.blockNumber,
      dbData.network,
    )
    return {
      ...action,
      members: rawAction.metadata.addresses.map((address: string) => ({ address })),
      currentMembers: currentMembers.members,
    }
  },

  _handleMultiSigSetting(action: IProposalAction, rawAction: any, dbData: Proposal) {
    return {
      ...action,
      proposedSettings: [
        {
          term: 'required',
          definition: rawAction.metadata.minApprovals,
        },
      ],
      existingSettings: [
        {
          term: 'required',
          definition: dbData.settings.minApprovals,
        },
      ],
    }
  },

  _handleTokenVotingSetting(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const tupleType = ['uint8', 'uint32', 'uint32', 'uint64', 'uint256']
    const parameters = rawAction.decoded[0].map((value: any, index: any) => ({
      type: tupleType[index],
      value: typeof value === 'object' ? value.toString() : value,
    }))

    return {
      ...action,
      inputData: {
        ...action.inputData,
        parameters,
      },
      proposedSettings: [
        { term: 'votingMode', definition: rawAction.metadata.votingMode },
        { term: 'supportThreshold', definition: rawAction.metadata.supportThreshold.toString() },
        { term: 'minParticipation', definition: rawAction.metadata.minParticipation.toString() },
        { term: 'minDuration', definition: rawAction.metadata.minDuration },
        { term: 'minProposerVotingPower', definition: rawAction.metadata.minProposerVotingPower.toString() },
      ],
      existingSettings: [
        { term: 'votingMode', definition: dbData.settings.votingMode },
        { term: 'supportThreshold', definition: dbData.settings.supportThreshold },
        { term: 'minParticipation', definition: dbData.settings.minParticipation },
        { term: 'minDuration', definition: dbData.settings.minDuration },
        { term: 'minProposerVotingPower', definition: dbData.settings.minProposerVotingPower },
      ],
    }
  },

  async _handleMetadataUpdate(action: IProposalAction, rawAction: any, dbData: Proposal) {
    const existingMetadata = await Models.LogDaoMetadata.getMetadataAtBlockNumber(
      dbData.daoAddress,
      dbData.blockNumber,
      dbData.network,
    )

    return {
      ...action,
      proposedMetadata: {
        name: rawAction.metadata.name,
        description: rawAction.metadata.description,
        logo: rawAction.metadata.avatar,
        links: rawAction.metadata.links,
      },
      existingMetadata,
    }
  },
}

export default ActionTransformer
