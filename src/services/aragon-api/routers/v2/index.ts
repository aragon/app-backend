import Router from '@koa/router'
import MemberRouter from './member'
import ProposalRouter from './proposal'
import VoteRouter from './vote'

const V2Router = {
  router() {
    const router = new Router()

    const memberRouter = MemberRouter.router()
    const proposalRouter = ProposalRouter.router()
    const voteRouter = VoteRouter.router()

    router.use('/members', memberRouter.routes(), memberRouter.allowedMethods())
    router.use('/proposals', proposalRouter.routes(), proposalRouter.allowedMethods())
    router.use('/votes', voteRouter.routes(), voteRouter.allowedMethods())

    return router
  },
}

export default V2Router
