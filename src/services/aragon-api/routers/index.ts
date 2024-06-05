import Router from '@koa/router'
import StatusRouter from './status'
import DaoRouter from './dao'
import TokenRouter from './token'

const MainRouter = {
  router() {
    const daoRouter = DaoRouter.router()
    const statusRouter = StatusRouter.router()
    const tokenRouter = TokenRouter.router()

    const mainRouter = new Router()

    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    mainRouter.use('/dao', daoRouter.routes(), daoRouter.allowedMethods())
    mainRouter.use('/token', tokenRouter.routes(), tokenRouter.allowedMethods())

    return mainRouter
  },
}

export default MainRouter
