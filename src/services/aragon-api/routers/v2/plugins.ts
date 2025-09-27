import Router, { type RouterContext } from '@koa/router'
import type { IPluginStatus, HexAddress, IPluginExtraParams, NetworksEnum, IPluginInterfaceType } from '@types'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
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
      extraParams: {
        daoAddress: ctx.query.daoAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        interfaceType: ctx.query.type as IPluginInterfaceType,
        status: (ctx.query.status as IPluginStatus | 'all') || 'all',
        isProcess: Utils.parseBoolean(ctx.query.isProcess),
        isSupported: Utils.parseBoolean(ctx.query.isSupported),
      },
      requireRule: RequireRules.allRequired('daoAddress', 'network'),
      schemas: {
        extra: PluginSchema.getPluginsByDao,
      },
    })

    ctx.body = await PluginsController.getPluginsByDao(result.extraParams)
  },

  router(): Router {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)
    router.get('/by-dao', PluginRouter.getPluginsByDao)

    return router
  },
}

export default PluginRouter
