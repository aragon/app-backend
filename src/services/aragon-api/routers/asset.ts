import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import AssetSchema from '@api/routers/schema/asset'
import AssetController from '@api/controllers/asset'
import { type HexAddress, type IAssetExtraParams, type NetworksEnum } from '@types'

const AssetRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'amountUsd' })
    const extraParams: IAssetExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
    }

    await ValidationSchema.validateParams(AssetSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await AssetController.getAssetsWithPagination(paginationParams, extraParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Assets
     * @apiName Assets
     * @apiGroup Assets
     * @apiDescription Get Assets
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', AssetRouter.getWithPagination)

    return router
  },
}

export default AssetRouter
