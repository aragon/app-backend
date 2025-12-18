import AssetController from '@api/controllers/asset'
import AssetSchema from '@api/routers/schema/asset'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import ModelUtils from '@models/utils/models'
import { type HexAddress, type IAssetExtraParams, type IPairParams, type NetworksEnum } from '@types'

const AssetRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'amountUsd' })
    const extraParams: IAssetExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.address as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
      ['address'],
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(AssetSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await AssetController.getAssetsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
  },

  router(): Router {
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
