import Router from '@koa/router'
import StatusAdminRouter from './status'
import SyncAdminRouter from './queue'
import DaoAdminRouter from './dao'
import CapitalDistributorAdminRouter from './capitalDistributor'

const MainAdminRouter = {
  router() {
    const statusAdminRouter = StatusAdminRouter.router()
    const syncAdminRouter = SyncAdminRouter.router()
    const daoAdminRouter = DaoAdminRouter.router()
    const capitalDistributorAdminRouter = CapitalDistributorAdminRouter.router()

    const mainAdminRouter = new Router()

    mainAdminRouter.use(statusAdminRouter.routes(), statusAdminRouter.allowedMethods())
    mainAdminRouter.get('/health', ctx => (ctx.status = 200))
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
