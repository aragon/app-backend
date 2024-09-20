import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import ProposalSchema from '@api/routers/schema/proposal'
import ProposalController from '@api/controllers/proposal'
import { type HexAddress, type IPairParams, type IProposalExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const ProposalRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'proposalIndex' })
    const extraParams: IProposalExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      creatorAddress: ctx.query.creatorAddress as HexAddress,
      daoInfo: Utils.parseBoolean(ctx.query.daoInfo),
      proposalIndex: Utils.parseNumber(ctx.query.proposalIndex),
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
    const anyInvalidParams = Utils.extractAdditionalParams({}, ctx.query)

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(ProposalSchema.getProposalById, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await ProposalController.getProposalById(formattedValues.id)
  },

  canCreateProposal: async function (ctx: RouterContext) {
    const requestBody = ctx.request.body as {
      memberAddress?: string
      pluginAddress: string
      network: NetworksEnum
    }

    const params = {
      memberAddress: requestBody.memberAddress,
      pluginAddress: requestBody.pluginAddress,
      network: requestBody.network,
    }

    const formattedValue = await ValidationSchema.validateParams(ProposalSchema.canCreateProposal, params)

    ctx.body = await ProposalController.canCreateProposal(formattedValue)
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
     * @api {get} /:id Get Proposal by Id
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal by Id
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', ProposalRouter.getProposalById)

    /**
     * @api {post} /proposal/canCreateProposal
     * @apiDescription Check if the user is allowed to create the proposal
     */

    router.post('/canCreateProposal', ProposalRouter.canCreateProposal)

    return router
  },
}

export default ProposalRouter
