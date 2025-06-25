import Router, { type RouterContext } from '@koa/router'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import VoteController from '@api/controllers/vote'
import {
  type HexAddress,
  type ICanVoteParams,
  type IPaginationParams,
  type IPairParams,
  type IVoteExtraParams,
  type NetworksEnum,
} from '@types'
import VoteSchema from '@api/routers/schema/vote'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const VoteRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        memberAddress: ctx.query.address as HexAddress,
        daoAddress: ctx.query.daoAddress as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
        includeInfo: Utils.parseBoolean(ctx.query.includeInfo),
        highlightUser: ctx.query.highlightUser as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
        ens: ctx.query.ens as string,
        proposalId: ctx.query.proposalId as string,
      },
      skipParams: ['address'],
      requireRule: RequireRules.daoIdOrNetworkWithAddress([
        'daoAddress',
        'pluginAddress',
        'tokenAddress',
        'memberAddress',
      ]),
      schemas: {
        extra: VoteSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await VoteController.getVoteWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IVoteExtraParams,
      result.pairParams as IPairParams,
    )
  },

  async getMemberVoteInfo(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      extraParams: {
        memberAddress: ctx.query.memberAddress as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        proposalIndex: ctx.query.proposalIndex?.toString()!,
        network: ctx.query.network as NetworksEnum,
      },
      schemas: {
        extra: VoteSchema.canVote,
      },
    })

    ctx.body = await VoteController.memberVotesInfo(result.extraParams as ICanVoteParams)
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
