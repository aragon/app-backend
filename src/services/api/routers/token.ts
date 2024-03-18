import Router, { type RouterContext } from '@koa/router'
import TokenController from '@services/api/controllers/token'
import ValidationSchema from '@helpers/validationSchema'
import TokenSchema from '@services/api/routers/schema/token'
import { pick } from 'lodash'

const TokenRouter = {
  getToken: async function(ctx: RouterContext) {
    const params = pick(ctx.query, ['address', 'network'])

    const formattedParams = await ValidationSchema.validateParams(
      TokenSchema.getToken,
      params,
    )

    ctx.body =
      await TokenController.getTokenByAddressAndNetwork(formattedParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Token
     * @apiName Token
     * @apiGroup Token
     * @apiDescription Get Token
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', TokenRouter.getToken)

    return router
  },
}

export default TokenRouter
