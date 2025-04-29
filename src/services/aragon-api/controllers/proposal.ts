import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IPairParams,
  EnumQueueName,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import { type ICanCreateProposal } from '@src/types/voting'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import logger from '@logger'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'ProposalController' })

const ProposalController = {
  getProposalBySlug: async (fullSlug: string, pairParams: IPairParams = {}): Promise<IProposalsResponse> => {
    const extraParams: any = await PairDataModule.pairFromExtraParams({}, pairParams)
    assertExposable(extraParams?.daoAddress, ErrorKeyEnum.daoNotFound)

    const { slug, index } = utils.splitSlug(fullSlug)

    const pluginId = await Models.Plugin.getPluginIdBySlugAndDao(slug, extraParams.daoAddress, extraParams.network)
    assertExposable(pluginId, ErrorKeyEnum.pluginNotFound)

    const plugin = await Models.Plugin.findByEntityId(pluginId)
    assertExposable(plugin, ErrorKeyEnum.pluginNotFound)

    const proposal = await Models.Proposal.findByProposalIncrementalId(index, plugin.address, plugin.network)
    assertExposable(proposal?.id, ErrorKeyEnum.proposalNotFound)

    return ProposalController.getProposalById(proposal.id)
  },

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
      const [member, plugin] = await Promise.all([
        Models.Member.findByAddress(params.memberAddress),
        Models.Plugin.findByAddress(params.pluginAddress, params.network),
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
  },

  async canCastVote({ userAddress, proposalId }) {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.voteInfo,
        {
          id: `voteInfo-${proposalId}-${userAddress}`,
          params: { proposalId, userAddress },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (error) {
      logger.warn('Error while checking if user can cast vote', llo({ error, userAddress, proposalId }))
      return false
    }
  },

  getProposalDecodedActions: async (id: string): Promise<any> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    if (!proposal.rawActions || proposal.rawActions.length === 0) {
      return { actions: [] }
    }

    return {
      actions: proposal.actions || [],
      rawActions: proposal.rawActions || [],
    }
  },
}

export default ProposalController
