import QueueAdminController from '@admin-api/controllers/queue'
import GenericSchema from '@admin-api/routers/schema/generic'
import Utils from '@helpers/utils'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import AuthMiddleware from '@middlewares/auth'
import { type IAQueueDao, type IAQueueProposal, type IQueueSyncDelegateChanged, type NetworksEnum } from '@types'

const QueueAdminRouter = {
  queueDaoPlugins: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.daoAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await QueueAdminController.queuePlugins(formattedValues)
  },

  queueDaoTransactions: async function (ctx: RouterContext) {
    const params = {
      daoAddress: ctx.params.daoAddress,
      network: ctx.params.network,
      reset: Utils.parseBoolean(ctx.query.reset),
      resetExecutions: Utils.parseBoolean(ctx.query.resetExecutions),
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.daoTransactionParams, params)

    ctx.body = await QueueAdminController.queueDaoTransactions(formattedValues)
  },

  queueDaoAssets: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.daoAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await QueueAdminController.queueDaoAssets(formattedValues)
  },

  queueDaoMetrics: async function (ctx: RouterContext) {
    const params: IAQueueDao = {
      address: ctx.params.daoAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await QueueAdminController.queueDaoMetrics(formattedValues)
  },

  queueProposalMetrics: async function (ctx: RouterContext) {
    const params: IAQueueProposal = {
      proposalIndex: ctx.params.proposalIndex,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.queueProposalMetrics, params)

    ctx.body = await QueueAdminController.queueProposalMetrics(formattedValues)
  },

  queueDelegateChangedSync: async function (ctx: RouterContext) {
    const params: IQueueSyncDelegateChanged = {
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.delegateChangedSync, params)

    ctx.body = await QueueAdminController.queueDelegateChangedSync(formattedValues)
  },

  refreshTokenPrice: async function (ctx: RouterContext) {
    const params: IAQueueDao = {
      address: ctx.params.tokenAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

    ctx.body = await QueueAdminController.refreshTokenPrice(formattedValues)
  },

  recalculateProposalActions: async function (ctx: RouterContext) {
    const params = {
      incrementalId: parseInt(ctx.query.incrementalId as string),
      pluginAddress: ctx.query.pluginAddress as string,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.recalculateProposalActions, params)

    ctx.body = await QueueAdminController.recalculateProposalActions(formattedValues)
  },

  queueEventReplay: async function (ctx: RouterContext) {
    const body = (ctx.request as any).body ?? {}
    const params = {
      txHash: body.txHash,
      network: body.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.eventReplayParams, params)

    ctx.body = await QueueAdminController.queueEventReplay(formattedValues)
  },

  router(): Router {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()

    router.post('/dao-plugins/:daoAddress/:network', authedAdmin, QueueAdminRouter.queueDaoPlugins)
    router.post('/dao-assets/:daoAddress/:network', authedAdmin, QueueAdminRouter.queueDaoAssets)
    router.post('/dao-transactions/:daoAddress/:network', authedAdmin, QueueAdminRouter.queueDaoTransactions)
    router.post('/dao-metrics/:daoAddress/:network', authedAdmin, QueueAdminRouter.queueDaoMetrics)
    router.post(
      '/proposal-metrics/:proposalIndex/:pluginAddress/:network',
      authedAdmin,
      QueueAdminRouter.queueProposalMetrics,
    )
    router.post('/token-price/:tokenAddress/:network', authedAdmin, QueueAdminRouter.refreshTokenPrice)
    router.post('/proposals/decode', authedAdmin, QueueAdminRouter.recalculateProposalActions)
    router.post('/event-replay', authedAdmin, QueueAdminRouter.queueEventReplay)
    router.post(
      '/delegate-changed-sync/:pluginAddress/:network',
      authedAdmin,
      QueueAdminRouter.queueDelegateChangedSync,
    )

    return router
  },
}

export default QueueAdminRouter
