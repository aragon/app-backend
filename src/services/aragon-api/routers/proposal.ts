import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import ProposalSchema from '@api/routers/schema/proposal'
import ProposalController from '@api/controllers/proposal'
import { type HexAddress, type IProposalExtraParams, type NetworksEnum } from '@types'

const ProposalRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'proposalId' })
    const extraParams: IProposalExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      creatorAddress: ctx.query.creatorAddress as HexAddress,
    }

    await ValidationSchema.validateParams(ProposalSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await ProposalController.getProposalsWithPagination(paginationParams, extraParams)
  },

  getProposalById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id, // address
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalById, params)

    ctx.body = await ProposalController.getProposalById(formattedValues.id)
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
     * @api {get} /:id Get Proposal by id
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', ProposalRouter.getProposalById)

    return router
  },
}

export default ProposalRouter
