import Router from '@koa/router'
import ContractRouter from './contract'
import DaoRouter from './dao'

const V3Router = {
  router(): Router {
    const router = new Router()
    const daoRouter = DaoRouter.router()
    const contractRouter = ContractRouter.router()

    router.use('/daos', daoRouter.routes(), daoRouter.allowedMethods())
    router.use('/contract', contractRouter.routes(), contractRouter.allowedMethods())

    return router
  },
}

export default V3Router
