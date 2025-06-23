import Router from '@koa/router'
import MemberRouter from './member'
import ProposalRouter from './proposal'

const V2Router = {
  router() {
    const router = new Router()

    const memberRouter = MemberRouter.router()
    const proposalRouter = ProposalRouter.router()

    router.use('/members', memberRouter.routes(), memberRouter.allowedMethods())
    router.use('/proposals', proposalRouter.routes(), proposalRouter.allowedMethods())

    return router
  },
}

export default V2Router
