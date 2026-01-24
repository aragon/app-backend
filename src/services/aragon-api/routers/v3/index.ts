import Router from '@koa/router'
import DaoRouter from './dao'

const V3Router = {
  router(): Router {
    const router = new Router()
    const daoRouter = DaoRouter.router()
    router.use('/daos', daoRouter.routes(), daoRouter.allowedMethods())
    return router
  },
}

export default V3Router
