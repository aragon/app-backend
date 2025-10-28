import Router, { type RouterContext } from '@koa/router'
import PermissionController from '@api/controllers/permission'
import ValidationSchema from '@helpers/validationSchema'
import PermissionSchema from '@api/routers/schema/permission'
import { type IPaginationParams } from '@types'

const PermissionRouter = {
  getPermissionsByDao: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        daoAddress: ctx.params.daoAddress,
      },
      schemas: {
        params: PermissionSchema.getPermissionsByDao,
      },
    })

    ctx.body = await PermissionController.getPermissionsByDao(
      result.params.daoAddress,
      result.params.network,
      result.paginationParams as IPaginationParams,
    )
  },

  router(): Router {
    const router = new Router()

    router.get('/:network/:daoAddress', PermissionRouter.getPermissionsByDao)

    return router
  },
}

export default PermissionRouter
