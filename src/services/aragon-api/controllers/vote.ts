import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IVoteExtraParams,
  type IVoteResponse,
} from '@types'
import PairDataModule from '@modules/pairData'
import { type ICanVote } from '@src/types/voting'
import { assertExposable } from '@errors'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Vote.findWithPagination({ extraParams, paginationParams })
  },

  canVote: async (params: ICanVote) => {
    try {
      const [member, plugin] = await Promise.all([
        Models.Member.findByAddress(params.memberAddress),
        Models.Plugin.findByAddress(params.pluginAddress, params.network),
      ])

      assertExposable(!!member && !!plugin, ErrorKeyEnum.notFound)

      const [daoMappings, activeSettings, proposal] = await Promise.all([
        Models.DaoMemberMapping.findMapping({
          memberAddress: member.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: plugin.network,
        }),
        Models.Setting.findActive({
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: plugin.network,
        }),
        Models.Proposal.findByProposalIndex(params.proposalIndex, plugin.address, plugin.network),
      ])

      assertExposable(!!activeSettings && !!daoMappings && !!proposal, ErrorKeyEnum.notFound)

      const isExpired = new Date(proposal.endDate * 1000) <= new Date()
      const isExecuted = !!(proposal.executed && proposal.executed.status === true)

      if (isExpired || isExecuted) {
        return false
      }

      const userVotingStatus = await Models.Vote.findVoteOnPlugin({
        memberAddress: member.address,
        pluginAddress: plugin.address,
        network: plugin.network,
        proposalIndex: params.proposalIndex,
      })

      if (activeSettings.votingMode === 1) {
        return true
      }

      return !userVotingStatus
    } catch (e) {
      return false
    }
  },
}

export default VoteController
