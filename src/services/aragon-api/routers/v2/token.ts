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
    router.get('/:network/:address', TokenRouter.getTokenByAddress)

    return router
  },
}

export default TokenRouter
