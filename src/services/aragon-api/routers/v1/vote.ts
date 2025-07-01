import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import VoteController from '@api/controllers/vote'
import {
  type HexAddress,
  type ICanVoteParams,
  type IPairParams,
  type IVoteExtraParams,
  type NetworksEnum,
} from '@types'
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
      includeInfo: Utils.parseBoolean(ctx.query.includeInfo),
      highlightUser: ctx.query.highlightUser as HexAddress,
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

  async getMemberVoteInfo(ctx: RouterContext) {
    const params: ICanVoteParams = {
      memberAddress: ctx.query.memberAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      proposalIndex: ctx.query.proposalIndex?.toString()!,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(VoteSchema.canVote, params)

    ctx.body = await VoteController.memberVotesInfo(formattedValues)
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

    /**
     * @api {get} /member-vote-info Member Vote Info
     * @apiDescription Get member vote info
     * @apiName Member Vote Info
     * @apiGroup Vote
     * @apiSampleRequest /proposal/member-vote-info
     */
    router.get('/member-vote-info', VoteRouter.getMemberVoteInfo)

    return router
  },
}

export default VoteRouter
