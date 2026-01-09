import AssetController from '@api/controllers/asset'
import AssetSchema from '@api/routers/schema/asset'
import PaginationSchema from '@api/routers/schema/pagination'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import {
  type HexAddress,
  type IAssetExtraParams,
  type IPaginationParams,
  type IPairParams,
  type NetworksEnum,
} from '@types'

const AssetRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'amountUsd',
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        daoAddress: ctx.query.address as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
        onlyParent: ctx.query.onlyParent === 'true',
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      skipParams: ['address'],
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['daoAddress']),
      schemas: {
        extra: AssetSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await AssetController.getAssetsWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IAssetExtraParams,
      result.pairParams as IPairParams,
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
     * @apiSampleRequest /assets
     *
     */
    router.get('/', AssetRouter.getWithPagination)

    return router
  },
}

export default AssetRouter
