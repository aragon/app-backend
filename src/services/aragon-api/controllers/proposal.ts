import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import { type ICanCreateProposal } from '@src/types/voting'

const ProposalController = {
  getProposalById: async (id: string): Promise<IProposalsResponse> => {
    const proposal = await Models.Proposal.findWithEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)
    return proposal
  },

  getProposalsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IProposalExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IProposalsResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Proposal.findWithPagination({ extraParams, paginationParams })
  },

  canCreateProposal: async (params: ICanCreateProposal) => {
    try {
      const filterParams = await PairDataModule.pairFromExtraParams(params, params)
      /**
       * ENS as well also can be passed and the transformation should be happened at this point
       */
      assertExposable(!!filterParams.memberAddress, ErrorKeyEnum.notFound)

      const [member, plugin] = await Promise.all([
        Models.Member.findByAddress(filterParams.memberAddress),
        Models.Plugin.findByAddress(filterParams.pluginAddress, filterParams.network),
      ])

      assertExposable(member && plugin, ErrorKeyEnum.notFound)

      const [daoMappings, activeSettings] = await Promise.all([
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
      ])

      assertExposable(activeSettings, ErrorKeyEnum.notFound)

      if (!plugin.tokenAddress) {
        if (!activeSettings.onlyListed) {
          return true
        }

        return !!daoMappings
      }

      if (plugin.tokenAddress) {
        const userVotingPower = await Models.MemberBalance.findByAddressAndToken({
          address: member.address,
          tokenAddress: plugin.tokenAddress,
          network: plugin.network,
        })

        return !!daoMappings && Number(userVotingPower.votingPower) > Number(activeSettings.minProposerVotingPower)
      }
    } catch (e) {
      return false
    }

    return false
  },
}

export default ProposalController
