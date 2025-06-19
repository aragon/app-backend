import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import VoteController from '@api/controllers/vote'
import { type HexAddress, type ICanVoteParams, type NetworksEnum } from '@types'
import VoteSchema from '@api/routers/schema/vote'

const VoteRouter = {
  async canVote(ctx: RouterContext) {
    const params: ICanVoteParams = {
      memberAddress: ctx.query.memberAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      proposalIndex: ctx.query.proposalIndex?.toString()!,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(VoteSchema.canVote, params)

    const status = await VoteController.canVote(formattedValues)
    ctx.body = { status }
  },

  router() {
    const router = new Router()

    /**
     * @api {get} /can-vote Can Vote
     */
    router.get('/can-vote', VoteRouter.canVote)

    return router
  },
}

export default VoteRouter
