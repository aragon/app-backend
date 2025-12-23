import StatusAdminController from '@admin-api/controllers/status'
import Router, { type RouterContext } from '@koa/router'

const StatusAdminRouter = {
  status(ctx: RouterContext) {
    ctx.body = StatusAdminController.getStatus()
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} / Get status
     * @apiName status
     * @apiGroup Status
     * @apiDescription Get status
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', StatusAdminRouter.status)

    return router
  },
}

export default StatusAdminRouter
