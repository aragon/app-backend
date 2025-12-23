import Router from '@koa/router'
import CapitalDistributorAdminRouter from './capitalDistributor'
import DaoAdminRouter from './dao'
import MetricsAdminRouter from './metrics'
import SyncAdminRouter from './queue'
import StatusAdminRouter from './status'

const MainAdminRouter = {
  router(): Router {
    const statusAdminRouter = StatusAdminRouter.router()
    const syncAdminRouter = SyncAdminRouter.router()
    const daoAdminRouter = DaoAdminRouter.router()
    const capitalDistributorAdminRouter = CapitalDistributorAdminRouter.router()
    const metricsAdminRouter = MetricsAdminRouter.router()

    const mainAdminRouter = new Router()

    mainAdminRouter.use(statusAdminRouter.routes(), statusAdminRouter.allowedMethods())
    mainAdminRouter.get('/health', ctx => (ctx.status = 200))
    mainAdminRouter.use('/metrics', metricsAdminRouter.routes(), metricsAdminRouter.allowedMethods())
    mainAdminRouter.use('/queue', syncAdminRouter.routes(), syncAdminRouter.allowedMethods())
    mainAdminRouter.use('/dao', daoAdminRouter.routes(), daoAdminRouter.allowedMethods())
    mainAdminRouter.use(
      '/capital-distributor',
      capitalDistributorAdminRouter.routes(),
      capitalDistributorAdminRouter.allowedMethods(),
    )

    return mainAdminRouter
  },
}

export default MainAdminRouter
