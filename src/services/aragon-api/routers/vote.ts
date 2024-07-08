import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import VoteController from '@api/controllers/vote'
import { type HexAddress, type IVoteExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import VoteSchema from '@api/routers/schema/vote'

const VoteRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultOrder: 'blockNumber' })
    const extraParams: IVoteExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
      memberAddress: ctx.query.memberAddress as HexAddress,
      proposalId: ctx.query.proposalId ? Number(ctx.query.proposalId) : undefined,
    }

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(VoteSchema.getExtraParams, extraParams),
    ])

    ctx.body = await VoteController.getVoteWithPagination(formattedPaginationParams, formattedExtraParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Vote
     * @apiName Vote
     * @apiGroup Vote
     * @apiDescription Get Vote
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', VoteRouter.getWithPagination)

    return router
  },
}

export default VoteRouter
