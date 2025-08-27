import Router from '@koa/router'
import MemberRouter from './member'
import ProposalRouter from './proposal'
import AssetRouter from '@api/routers/v2/asset'
import DaoRouter from '@api/routers/v2/dao'
import SettingRouter from '@api/routers/v2/setting'
import TokenRouter from '@api/routers/v2/token'
import TransactionRouter from '@api/routers/v2/transaction'
import VoteRouter from '@api/routers/v2/vote'
import ContractRouter from '@api/routers/v2/contract'
import PluginRouter from '@api/routers/v2/plugins'
import ExecuteSelectorRouter from '@api/routers/v2/executeSelector'
import SimulationRouter from '@api/routers/v2/simulation'

const V2Router = {
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
    const executeSelectorRouter = ExecuteSelectorRouter.router()
    const simulationRouter = SimulationRouter.router()

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
    router.use('/execute-selectors', executeSelectorRouter.routes(), executeSelectorRouter.allowedMethods())
    router.use('/simulations', simulationRouter.routes(), simulationRouter.allowedMethods())

    return router
  },
}

export default V2Router
