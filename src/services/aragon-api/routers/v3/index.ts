import ContractRouter from '@api/routers/v3/contract'
import Router from '@koa/router'

const V3Router = {
  router(): Router {
    const router = new Router()

    const contractRouter = ContractRouter.router()

    router.use('/contract', contractRouter.routes(), contractRouter.allowedMethods())

    return router
  },
}

export default V3Router
