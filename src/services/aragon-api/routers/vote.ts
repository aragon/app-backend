import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import VoteController from '@api/controllers/vote'
import { type HexAddress, type IPairParams, type IVoteExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import VoteSchema from '@api/routers/schema/vote'
import Utils from '@helpers/utils'

const VoteRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: IVoteExtraParams = {
      network: ctx.query.network as NetworksEnum,
      memberAddress: ctx.query.address as HexAddress,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
      includeInfo: ctx.query.includeInfo === 'true' && Boolean(ctx.query.includeInfo),
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
      ens: ctx.query.ens as string,
      proposalId: ctx.query.proposalId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
      ['address'],
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(VoteSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await VoteController.getVoteWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
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
