import StatusController from '@api/controllers/status'
import Router, { type RouterContext } from '@koa/router'

const StatusRouter = {
  status(ctx: RouterContext) {
    ctx.body = StatusController.getStatus()
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
    router.get('/', StatusRouter.status)

    return router
  },
}

export default StatusRouter
