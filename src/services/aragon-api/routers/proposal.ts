import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import ProposalSchema from '@api/routers/schema/proposal'
import ProposalController from '@api/controllers/proposal'
import { type HexAddress, type IProposalExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const ProposalRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultOrder: 'proposalId' })
    const extraParams: IProposalExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      creatorAddress: ctx.query.creatorAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(ProposalSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(ProposalSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await ProposalController.getProposalsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
  },

  getProposalById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalById, params)

    ctx.body = await ProposalController.getProposalById(formattedValues.id)
  },

  getProposalByTransactionHash: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      transactionHash: ctx.params.transactionHash,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.getProposalByTransactionHash, params)

    ctx.body = await ProposalController.getProposalByTransactionHash(
      formattedValues.transactionHash,
      formattedValues.network,
    )
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
     * @api {get} /:network/:transactionHash Get Proposal by transactionHash
     * @apiName Proposals
     * @apiGroup Proposals
     * @apiDescription Get Proposal by transactionHash
     *
     * @apiSampleRequest /:network/:transactionHash
     */
    router.get('/:network/:transactionHash', ProposalRouter.getProposalByTransactionHash)

    return router
  },
}

export default ProposalRouter
