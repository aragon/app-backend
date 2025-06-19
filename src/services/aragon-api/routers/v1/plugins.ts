import Router, { type RouterContext } from '@koa/router'
import { type HexAddress, type NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import PluginSchema from '@api/routers/schema/plugin'
import PluginsController from '@api/controllers/plugins'

const PluginRouter = {
  async getInstallationData(ctx: RouterContext) {
    const params = {
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedParams = await ValidationSchema.validateParams(PluginSchema.getInstallationData, params)

    ctx.body = await PluginsController.getInstallationData(formattedParams)
  },

  router() {
    const router = new Router()

    router.get('/installation-data', PluginRouter.getInstallationData)

    return router
  },
}

export default PluginRouter
