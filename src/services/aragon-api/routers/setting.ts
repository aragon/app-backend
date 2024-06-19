import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import SettingSchema from '@api/routers/schema/setting'
import SettingController from '@api/controllers/setting'
import { type HexAddress, type ISettingExtraParams, type NetworksEnum } from '@types'

const SettingRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'amountUsd' })
    const extraParams: ISettingExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(SettingSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await SettingController.getSettingsWithPagination(paginationParams, extraParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Settings
     * @apiName Settings
     * @apiGroup Settings
     * @apiDescription Get Settings
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', SettingRouter.getWithPagination)

    return router
  },
}

export default SettingRouter
