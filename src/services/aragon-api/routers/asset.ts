import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import AssetSchema from '@api/routers/schema/asset'
import AssetController from '@api/controllers/asset'
import { type HexAddress, type IAssetExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const AssetRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'amountUsd' })
    const extraParams: IAssetExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(AssetSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(AssetSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await AssetController.getAssetsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
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
