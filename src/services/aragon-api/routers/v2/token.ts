import TokenController from '@api/controllers/token'
import TokenSchema from '@api/routers/schema/token'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

const TokenRouter = {
  getTokenByAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        address: ctx.params.address,
      },
      schemas: {
        params: TokenSchema.getTokenByAddress,
      },
    })

    ctx.body = await TokenController.getTokenByAddress(result.params)
  },

  getGovernanceRewards: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network,
      },
      extraParams: {
        lookbackDate: ctx.query.lookbackDate as string,
        rewardTotalAmount: ctx.query.rewardTotalAmount as string,
      },
      schemas: {
        params: TokenSchema.getGovernanceRewardsParams,
        extra: TokenSchema.getGovernanceRewardsQuery,
      },
    })

    ctx.body = await TokenController.getGovernanceRewards({
      ...result.params,
      ...result.extraParams,
    } as any)
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} /:network/:address Get Token by address
     * @apiName Tokens
     * @apiGroup Tokens
     * @apiDescription Get Token by address
     *
     * @apiSampleRequest /:network/:address
     *
     */
    router.get('/rewards/:pluginAddress/:network', TokenRouter.getGovernanceRewards)
    router.get('/:network/:address', TokenRouter.getTokenByAddress)

    return router
  },
}

export default TokenRouter
