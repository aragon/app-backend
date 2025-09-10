import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import GenericSchema from '@admin-api/routers/schema/generic'
import DaoAdminController from '@admin-api/controllers/dao'
import AuthMiddleware from '@middlewares/auth'

const DaoAdminRouter = {
  setVisibilityStatus: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.daoAddress,
      network: ctx.params.network,
      status: ctx.params.status,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.setDaoVisibilityStatusParams, params)

    ctx.body = await DaoAdminController.setVisibilityStatus(formattedValues)
  },

  router(): Router {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()

    router.post('/set-status/:daoAddress/:network/:status', authedAdmin, DaoAdminRouter.setVisibilityStatus)

    return router
  },
}

export default DaoAdminRouter
