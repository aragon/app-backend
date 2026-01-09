import Router from '@koa/router'
import AssetRouter from './asset'
import ContractRouter from './contract'
import DaoRouter from './dao'
import MemberRouter from './member'
import PluginRouter from './plugins'
import ProposalRouter from './proposal'
import SettingRouter from './setting'
import TokenRouter from './token'
import TransactionRouter from './transaction'
import VoteRouter from './vote'

const V1Router = {
  router(): Router {
    const router = new Router()

    const assetRouter = AssetRouter.router()
    const daoRouter = DaoRouter.router()
    const memberRouter = MemberRouter.router()
    const proposalRouter = ProposalRouter.router()
    const settingRouter = SettingRouter.router()
    const tokenRouter = TokenRouter.router()
    const transactionRouter = TransactionRouter.router()
    const voteRouter = VoteRouter.router()
    const contractRouter = ContractRouter.router()
    const pluginRouter = PluginRouter.router()

    router.use('/assets', assetRouter.routes(), assetRouter.allowedMethods())
    router.use('/daos', daoRouter.routes(), daoRouter.allowedMethods())
    router.use('/members', memberRouter.routes(), memberRouter.allowedMethods())
    router.use('/proposals', proposalRouter.routes(), proposalRouter.allowedMethods())
    router.use('/settings', settingRouter.routes(), settingRouter.allowedMethods())
    router.use('/tokens', tokenRouter.routes(), tokenRouter.allowedMethods())
    router.use('/transactions', transactionRouter.routes(), transactionRouter.allowedMethods())
    router.use('/votes', voteRouter.routes(), voteRouter.allowedMethods())
    router.use('/contract', contractRouter.routes(), contractRouter.allowedMethods())
    router.use('/plugins', pluginRouter.routes(), pluginRouter.allowedMethods())

    return router
  },
}

export default V1Router
