import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import GenericSchema from '@admin-api/routers/schema/generic'
import QueueAdminController from '@admin-api/controllers/queue'
import AuthMiddleware from '@middlewares/auth'
import { type IAQueueDao, type IAQueueProposal } from '@types'

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
      address: ctx.params.daoAddress,
      network: ctx.params.network,
    }

    const formattedValues = await ValidationSchema.validateParams(GenericSchema.defaultParams, params)

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

  router() {
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

    return router
  },
}

export default QueueAdminRouter
