import Router, { type RouterContext } from '@koa/router'
import type { HexAddress, IPluginExtraParams, NetworksEnum, IPluginInterfaceType, IGetPluginsByDaoParams } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import PluginSchema from '@api/routers/schema/plugin'
import PluginsController from '@api/controllers/plugins'
import Utils from '@src/helpers/utils'

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

  router(): Router {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)
    router.get('/by-dao/:network/:daoAddress', PluginRouter.getPluginsByDao)

    return router
  },
}

export default PluginRouter
