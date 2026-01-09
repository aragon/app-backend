import PluginsController from '@api/controllers/plugins'
import PluginSchema from '@api/routers/schema/plugin'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import Utils from '@src/helpers/utils'
import {
  type HexAddress,
  type IEventLogPluginType,
  type IGetPluginsByDaoParams,
  type ILogPluginSetupProcessorParams,
  type IPluginExtraParams,
  type IPluginInterfaceType,
  type NetworksEnum,
} from '@types'

const PluginRouter = {
  async getInstallationData(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      extraParams: {
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
      },
      schemas: {
        extra: PluginSchema.getInstallationData,
      },
    })

    ctx.body = await PluginsController.getInstallationData(result.extraParams as IPluginExtraParams)
  },

  async getPluginsByDao(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        daoAddress: ctx.params.daoAddress,
      },
      extraParams: {
        interfaceType: ctx.query.interfaceType as IPluginInterfaceType,
        status: ctx.query.status,
        isProcess: Utils.parseBoolean(ctx.query.isProcess),
        isSupported: Utils.parseBoolean(ctx.query.isSupported),
      },
      schemas: {
        params: PluginSchema.getPluginsByDaoUrlParams,
        extra: PluginSchema.getPluginsByDaoQueryParams,
      },
    })

    const controllerParams = {
      ...result.params,
      ...result.extraParams,
    }

    ctx.body = await PluginsController.getPluginsByDao(controllerParams as IGetPluginsByDaoParams)
  },

  async getPluginsByDaoWithDetails(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        daoAddress: ctx.params.daoAddress,
      },
      schemas: {
        params: PluginSchema.getPluginsByDaoUrlParams,
      },
    })

    ctx.body = await PluginsController.getPluginsByDaoWithDetails(result.params as IGetPluginsByDaoParams)
  },

  getLogPluginSetupProcessor: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network as NetworksEnum,
        event: ctx.params.event as IEventLogPluginType,
      },
      schemas: {
        params: PluginSchema.getLogPluginSetupProcessor,
      },
    })

    ctx.body = await PluginsController.getLogPluginSetupProcessor(result.params as ILogPluginSetupProcessorParams)
  },

  router(): Router {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)
    router.get('/by-dao/:network/:daoAddress', PluginRouter.getPluginsByDao)
    router.get('/by-dao/:network/:daoAddress/details', PluginRouter.getPluginsByDaoWithDetails)
    router.get('/logs/:pluginAddress/:network/:event', PluginRouter.getLogPluginSetupProcessor)

    return router
  },
}

export default PluginRouter
