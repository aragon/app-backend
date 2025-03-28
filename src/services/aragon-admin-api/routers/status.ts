import Router, { type RouterContext } from '@koa/router'
import StatusAdminController from '@admin-api/controllers/status'

const StatusAdminRouter = {
  status(ctx: RouterContext) {
    ctx.body = StatusAdminController.getStatus()
  },

  router() {
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
