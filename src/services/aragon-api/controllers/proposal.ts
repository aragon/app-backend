import config from '@config'
import { Models } from '@dbModels'
import { assertExposable, throwExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import logger from '@logger'
import PairDataModule from '@modules/pairData'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type ICanCreateProposalParams,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IProposalAudit,
  type IProposalExtraParams,
  type IProposalsResponse,
} from '@types'

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

    const hasOnlyDaoAndNetwork =
      extraParams.daoAddress &&
      extraParams.network &&
      !extraParams.pluginAddress &&
      !extraParams.creatorAddress &&
      !extraParams.isSubProposal &&
      !extraParams.proposalIndex &&
      !extraParams.incrementalId

    if (hasOnlyDaoAndNetwork) {
      const dao = await Models.Dao.findByAddress(extraParams.daoAddress, extraParams.network)
      if (dao?.linkedAccounts?.length && pairParams?.includeLinkedAccounts) {
        extraParams.daoAddresses = [extraParams.daoAddress, ...dao.linkedAccounts]
        paginationParams.sort = 'blockNumber'
        paginationParams.order = 'desc'
      }
    }

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

  auditProposal: async (id: string): Promise<IProposalAudit> => {
    const proposal = await Models.Proposal.findByEntityId(id)
    assertExposable(proposal, ErrorKeyEnum.proposalNotFound)

    if (proposal.audit) return proposal.audit
    if (proposal.executed?.status === true) throwExposable(ErrorKeyEnum.proposalAuditNotAllowed)

    const claimed = await Models.Proposal.claimForAudit(proposal.id, config.AUDIT.STALE_LOCK_MS)
    if (!claimed) {
      const fresh = await Models.Proposal.findByEntityId(proposal.id)
      assertExposable(fresh, ErrorKeyEnum.proposalNotFound)
      if (fresh.audit) return fresh.audit
      if (fresh.executed?.status === true) throwExposable(ErrorKeyEnum.proposalAuditNotAllowed)
      throwExposable(ErrorKeyEnum.proposalAuditInProgress)
    }
    // claimForAudit always sets auditStartedAt; the non-null assertion is safe.
    const claimToken = claimed.auditStartedAt as number

    let result: any
    try {
      result = await RabbitMQHelper.sendMessage(
        EnumQueueName.auditProposal,
        {
          id: `auditProposal-${proposal.network}-${proposal.pluginAddress.toLowerCase()}-${proposal.proposalIndex}`,
          params: {
            network: proposal.network,
            pluginAddress: proposal.pluginAddress,
            proposalIndex: proposal.proposalIndex,
          },
        },
        // Audit can take the full AUDIT.TIMEOUT_MS for the SDK call alone — give
        // RabbitMQ a longer wait than the default config.RABBITMQ.TIMEOUT.
        { waitResponse: true, timeout: config.AUDIT.TIMEOUT_MS + 10_000 },
      )
    } catch (err: any) {
      await Models.Proposal.releaseAudit(proposal.id, claimToken, null)
      logger.error('Proposal audit RPC failed', llo({ id, errorName: err?.name }))
      throwExposable(ErrorKeyEnum.proposalAuditFailed)
    }

    if (!result || result.error) {
      await Models.Proposal.releaseAudit(proposal.id, claimToken, null)
      logger.error('Proposal audit failed', llo({ id, error: result?.error }))
      throwExposable(ErrorKeyEnum.proposalAuditFailed)
    }

    const audit = result as IProposalAudit
    await Models.Proposal.releaseAudit(proposal.id, claimToken, audit)
    return audit
  },
}

export default ProposalController
