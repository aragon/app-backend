import SafeAdminController from '@admin-api/controllers/safe'
import GenericSchema from '@admin-api/routers/schema/generic'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import AuthMiddleware from '@middlewares/auth'

const SafeAdminRouter = {
  add: async function (ctx: RouterContext) {
    const params = { address: ctx.params.address, network: ctx.params.network }
    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await SafeAdminController.add(formattedValues)
  },

  remove: async function (ctx: RouterContext) {
    const params = { address: ctx.params.address, network: ctx.params.network }
    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await SafeAdminController.remove(formattedValues)
  },

  router(): Router {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()

    router.post('/:network/:address', authedAdmin, SafeAdminRouter.add)
    router.delete('/:network/:address', authedAdmin, SafeAdminRouter.remove)

    return router
  },
}

export default SafeAdminRouter
