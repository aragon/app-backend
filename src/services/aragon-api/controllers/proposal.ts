import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IProposalsResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IPairParams,
  EnumQueueName,
  type ICanCreateProposalParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
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

  canCreateProposal: async (params: ICanCreateProposalParams) => {
    try {
      return await RabbitMQHelper.sendMessage(
        EnumQueueName.canCreateProposal,
        {
          id: `canCreateProposal-${params.pluginAddress}-${params.memberAddress}-${params.network}`,
          params: {
            pluginAddress: params.pluginAddress,
            memberAddress: params.memberAddress,
            network: params.network,
          },
        },
        { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
      )
    } catch (error) {
      logger.warn('Error while checking if user can create proposal', llo({ error, ...params }))
      return false
    }
  },

  getProposalDecodedActions: async (id: string): Promise<any> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.notFound)

    if (!proposal.rawActions || proposal.rawActions.length === 0) {
      return { actions: [], decoding: proposal.decoding }
    }

    return {
      decoding: proposal.decoding,
      actions: proposal.actions || [],
      rawActions: proposal.rawActions || [],
    }
  },

  getProposalsByDaoHierarchy: async (params: {
    daoAddress: string
    network: string
    paginationParams?: IPaginationParams
  }) => {
    const dao = await Models.Dao.findByAddress(params.daoAddress, params.network)
    assertExposable(dao && dao.subDaos?.length, ErrorKeyEnum.daoNotFound)

    return await Models.Proposal.findByDaoHierarchy({
      daoAddress: params.daoAddress,
      network: params.network,
      paginationParams: params.paginationParams,
    })
  },
}

export default ProposalController
