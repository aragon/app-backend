import PluginsController from '@api/controllers/plugins'
import PluginSchema from '@api/routers/schema/plugin'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import { type HexAddress, type NetworksEnum } from '@types'

const PluginRouter = {
  async getInstallationData(ctx: RouterContext) {
    const params = {
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedParams = await ValidationSchema.validateParams(PluginSchema.getInstallationData, params)

    ctx.body = await PluginsController.getInstallationData(formattedParams)
  },

  router(): Router {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)

    return router
  },
}

export default PluginRouter
