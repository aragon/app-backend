import Router from '@koa/router'
import StatusRouter from './status'
import DaoRouter from './dao'

const MainRouter = {
  router() {
    const daoRouter = DaoRouter.router()
    const statusRouter = StatusRouter.router()

    const mainRouter = new Router()

    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    mainRouter.use('/dao', daoRouter.routes(), daoRouter.allowedMethods())

    return mainRouter
  },
}

export default MainRouter
