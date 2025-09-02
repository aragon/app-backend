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
      isExecuted: Utils.parseBoolean(ctx.query.isExecuted),
      isSubProposal: Utils.parseBoolean(ctx.query.isSubProposal),
      proposalIndex: ctx.query.proposalIndex?.toString(),
      incrementalId: ctx.query.incrementalId !== undefined ? Number(ctx.query.incrementalId || 0) : undefined,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
      onlyActive: Utils.parseBoolean(ctx.query.onlyActive),
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

  getProposalBySlug: async function (ctx: RouterContext) {
    const params = {
      slug: ctx.params.slug,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...pairParams }, ctx.query)

    const [formattedParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(ProposalSchema.getProposalBySlug, params),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await ProposalController.getProposalBySlug(formattedParams.slug, formattedPairParams)
  },

  getProposalById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalById, params)

    ctx.body = await ProposalController.getProposalById(formattedValues.id)
  },

  getProposalDecodedActions: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalById, params)

    ctx.body = await ProposalController.getProposalDecodedActions(formattedValues.id)
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

  router(): Router {
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
     * @api {get} /:id Get Proposal by Id
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal by Id
     *
     * @apiSampleRequest /proposal/:id
     */
    router.get('/:id', ProposalRouter.getProposalById)

    /**
     * @api {get} /:id Get Proposal by Slug
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal by Slug
     *
     * @apiSampleRequest /proposal/slug/:slug
     */
    router.get('/slug/:slug', ProposalRouter.getProposalBySlug)

    /**
     * @api {get} /:id/actions Get Decoded Actions for a Proposal
     * @apiName ProposalActions
     * @apiGroup Proposals
     * @apiDescription Get decoded actions for a proposal when rawActions array length is more than zero
     *
     * @apiSampleRequest /proposal/:id/actions
     */
    router.get('/:id/actions', ProposalRouter.getProposalDecodedActions)

    return router
  },
}

export default ProposalRouter
