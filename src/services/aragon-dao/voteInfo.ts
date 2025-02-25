import { IPluginInterfaceType } from '@types'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { Models } from '@dbModels'
import type Proposal from '@models/schema/proposal'
import type Plugin from '@models/schema/plugin'

interface IVoteInfo {
  proposalId: string
  userAddress: string
}

export const VoteInfo = {
  getVoteInfo: async (voteInfo: IVoteInfo) => {
    try {
      const proposalInfo = await Models.Proposal.findOne({
        id: voteInfo.proposalId,
      })

      if (!proposalInfo) {
        return false
      }
      const { network, pluginAddress } = proposalInfo
      const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
      if (!plugin) {
        return false
      }

      const isExpired = proposalInfo.endDate !== 0 && new Date(proposalInfo.endDate * 1000) <= new Date()
      const isExecuted = proposalInfo.executed && proposalInfo.executed.status === true

      if (isExpired || isExecuted) {
        return false
      }

      const userVotingStatus = await Models.Vote.findVoteOnPlugin({
        memberAddress: voteInfo.userAddress,
        pluginAddress: plugin.address,
        network: plugin.network,
        proposalIndex: voteInfo.proposalId,
      })

      if (userVotingStatus && proposalInfo.settings.votingMode === 2) {
        return true
      }

      switch (plugin.interfaceType) {
        case IPluginInterfaceType.tokenVoting:
          return await VoteInfo._handleForTokenVoting(voteInfo.userAddress, proposalInfo, plugin)
        case IPluginInterfaceType.multisig:
          return await VoteInfo._handleForMultiSig(voteInfo.userAddress, proposalInfo, plugin)
        default:
          return false
      }
    } catch (error) {
      return false
    }
  },

  _handleForTokenVoting: async (userAddress: string, proposal: Proposal, plugin: Plugin) => {
    const { network, tokenAddress } = plugin

    const votingPower = await GovernanceErc20Helper.getPastVotes(
      userAddress,
      tokenAddress,
      proposal.blockNumber,
      proposal.blockTimestamp,
      network,
    )

    return Number(votingPower) > 0 && Number(votingPower) > proposal.settings.minParticipation
  },

  _handleForMultiSig: async (userAddress: string, proposal: Proposal, plugin: Plugin) => {
    const { network, address } = plugin

    if (!proposal.settings.onlyListed) {
      return true
    }
    return await Web3Helper.isMultisigMemberAtBlock(address, userAddress, proposal.blockNumber, network)
  },
}
