import Router from '@koa/router'
import StatusRouter from './status'
import DaoRouter from './dao'
import TokenRouter from './token'
import ProposalRouter from './proposal'

const MainRouter = {
  router() {
    const daoRouter = DaoRouter.router()
    const statusRouter = StatusRouter.router()
    const tokenRouter = TokenRouter.router()
    const proposalRouter = ProposalRouter.router()

    const mainRouter = new Router()

    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    mainRouter.use('/daos', daoRouter.routes(), daoRouter.allowedMethods())
    mainRouter.use('/tokens', tokenRouter.routes(), tokenRouter.allowedMethods())
    mainRouter.use('/proposals', proposalRouter.routes(), proposalRouter.allowedMethods())

    return mainRouter
  },
}

export default MainRouter
