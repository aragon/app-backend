import AssetRouter from '@api/routers/v2/asset'
import CapitalDistributorRouter from '@api/routers/v2/capitalDistributor'
import ContractRouter from '@api/routers/v2/contract'
import DaoRouter from '@api/routers/v2/dao'
import ExecuteSelectorRouter from '@api/routers/v2/executeSelector'
import GaugeRouter from '@api/routers/v2/gauge'
import PermissionRouter from '@api/routers/v2/permission'
import PluginRouter from '@api/routers/v2/plugins'
import PolicyRouter from '@api/routers/v2/policy'
import SettingRouter from '@api/routers/v2/setting'
import SimulationRouter from '@api/routers/v2/simulation'
import TokenRouter from '@api/routers/v2/token'
import TransactionRouter from '@api/routers/v2/transaction'
import VoteRouter from '@api/routers/v2/vote'
import Router from '@koa/router'
import MemberRouter from './member'
import ProposalRouter from './proposal'

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
    const capitalDistributorRouter = CapitalDistributorRouter.router()
    const gaugeRouter = GaugeRouter.router()
    const permissionRouter = PermissionRouter.router()
    const policyRouter = PolicyRouter.router()

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
    router.use('/capital-distributor', capitalDistributorRouter.routes(), capitalDistributorRouter.allowedMethods())
    router.use('/gauge', gaugeRouter.routes(), gaugeRouter.allowedMethods())
    router.use('/permissions', permissionRouter.routes(), permissionRouter.allowedMethods())
    router.use('/policies', policyRouter.routes(), policyRouter.allowedMethods())

    return router
  },
}

export default V2Router
