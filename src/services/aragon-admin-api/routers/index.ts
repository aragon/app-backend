import Router from '@koa/router'
import StatusAdminRouter from './status'
import SyncAdminRouter from './queue'

const MainAdminRouter = {
  router() {
    const statusAdminRouter = StatusAdminRouter.router()
    const syncAdminRouter = SyncAdminRouter.router()

    const mainAdminRouter = new Router()

    mainAdminRouter.use(statusAdminRouter.routes(), statusAdminRouter.allowedMethods())
    mainAdminRouter.get('/health', ctx => (ctx.status = 200))
    mainAdminRouter.use('/queue', syncAdminRouter.routes(), syncAdminRouter.allowedMethods())

    return mainAdminRouter
  },
}

export default MainAdminRouter
