import MetricsAdminController from '@admin-api/controllers/metrics'
import Router, { type RouterContext } from '@koa/router'
import AuthMiddleware from '@middlewares/auth'

const MetricsAdminRouter = {
  async getMetrics(ctx: RouterContext) {
    const metrics = await MetricsAdminController.getMetrics()
    ctx.set('Content-Type', 'text/plain; version=0.0.4')
    ctx.body = metrics
  },

  router(): Router {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()
    /**
     * @api {get} /metrics Get Prometheus metrics
     * @apiName getMetrics
     * @apiGroup Metrics
     * @apiDescription Get aggregated Prometheus metrics from all services
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', authedAdmin, MetricsAdminRouter.getMetrics)

    return router
  },
}

export default MetricsAdminRouter
