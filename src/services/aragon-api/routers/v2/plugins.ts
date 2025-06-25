import Router, { type RouterContext } from '@koa/router'
import { type HexAddress, type IPluginExtraParams, type NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import PluginSchema from '@api/routers/schema/plugin'
import PluginsController from '@api/controllers/plugins'

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

  router() {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)

    return router
  },
}

export default PluginRouter
