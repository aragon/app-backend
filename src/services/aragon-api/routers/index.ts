import Router from '@koa/router'
import StatusRouter from './status'
import AssetRouter from './asset'
import DaoRouter from './dao'
import MemberRouter from './member'
import ProposalRouter from './proposal'
import SettingRouter from './setting'
import TokenRouter from './token'
import TransactionRouter from './transaction'
import DelegateRouter from './delegate'
import VoteRouter from '@api/routers/vote'
import ContractRouter from '@api/routers/contract'

const MainRouter = {
  router() {
    const assetRouter = AssetRouter.router()
    const daoRouter = DaoRouter.router()
    const memberRouter = MemberRouter.router()
    const proposalRouter = ProposalRouter.router()
    const settingRouter = SettingRouter.router()
    const statusRouter = StatusRouter.router()
    const tokenRouter = TokenRouter.router()
    const transactionRouter = TransactionRouter.router()
    const delegateRouter = DelegateRouter.router()
    const voteRouter = VoteRouter.router()
    const contractRouter = ContractRouter.router()

    const mainRouter = new Router()

    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())
    mainRouter.get('/health', ctx => (ctx.status = 200))

    mainRouter.use('/assets', assetRouter.routes(), assetRouter.allowedMethods())
    mainRouter.use('/daos', daoRouter.routes(), daoRouter.allowedMethods())
    mainRouter.use('/members', memberRouter.routes(), memberRouter.allowedMethods())
    mainRouter.use('/proposals', proposalRouter.routes(), proposalRouter.allowedMethods())
    mainRouter.use('/settings', settingRouter.routes(), settingRouter.allowedMethods())
    mainRouter.use('/tokens', tokenRouter.routes(), tokenRouter.allowedMethods())
    mainRouter.use('/transactions', transactionRouter.routes(), transactionRouter.allowedMethods())
    mainRouter.use('/delegates', delegateRouter.routes(), delegateRouter.allowedMethods())
    mainRouter.use('/votes', voteRouter.routes(), voteRouter.allowedMethods())
    mainRouter.use('/contract', contractRouter.routes(), contractRouter.allowedMethods())

    return mainRouter
  },
}

export default MainRouter
