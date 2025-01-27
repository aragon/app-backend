import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import ProposalSchema from '@api/routers/schema/proposal'
import ProposalController from '@api/controllers/proposal'
import {
  type HexAddress,
  type ICanCreateProposalParams,
  type IPairParams,
  type IProposalExtraParams,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const ProposalRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'incrementalId' })
    const extraParams: IProposalExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      creatorAddress: ctx.query.creatorAddress as HexAddress,
      daoInfo: Utils.parseBoolean(ctx.query.daoInfo),
      proposalIndex: ctx.query.proposalIndex?.toString(),
      incrementalId: ctx.query.incrementalId !== undefined ? Number(ctx.query.incrementalId || 0) : undefined,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(ProposalSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await ProposalController.getProposalsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
  },

  getProposalById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalById, params)

    ctx.body = await ProposalController.getProposalById(formattedValues.id)
  },

  canCreateProposal: async function (ctx: RouterContext) {
    const params: ICanCreateProposalParams = {
      memberAddress: ctx.query.memberAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.canCreateProposal, params)

    ctx.body = await ProposalController.canCreateProposal(formattedValues)
  },

  canCastVote: async function (ctx: RouterContext) {
    const params = {
      proposalId: ctx.params.proposalId,
      userAddress: ctx.query.userAddress,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.canCastVote, params)

    ctx.body = await ProposalController.canCastVote(formattedValues)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Proposals
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposals
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', ProposalRouter.getWithPagination)

    /**
     * @api {get} /proposal/canCreateProposal
     * @apiDescription Check if the user is allowed to create the proposal
     */

    router.get('/can-create-proposal', ProposalRouter.canCreateProposal)

    /**
     * @api {get} / Check if the user is allowed to cast vote on a proposal
     */

    router.get('/:proposalId/can-vote', ProposalRouter.canCastVote)

    /**
     * @api {get} /:id Get Proposal by Id
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal by Id
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', ProposalRouter.getProposalById)

    return router
  },
}

export default ProposalRouter
