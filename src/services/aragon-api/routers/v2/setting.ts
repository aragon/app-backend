import Router, { type RouterContext } from '@koa/router'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import SettingSchema from '@api/routers/schema/setting'
import SettingController from '@api/controllers/setting'
import {
  type HexAddress,
  type IPaginationParams,
  type IPairParams,
  type ISettingExtraParams,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const SettingRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        daoAddress: ctx.query.daoAddress as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['daoAddress', 'tokenAddress']),
      schemas: {
        extra: SettingSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await SettingController.getSettingsWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as ISettingExtraParams,
      result.pairParams as IPairParams,
    )
  },

  getActiveSettingByDaoId: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        id: ctx.params.daoId,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
      },
      schemas: {
        params: SettingSchema.getDaoByIdV2,
      },
    })

    ctx.body = await SettingController.getActiveSettingByDaoId(result.params.id, result.params.pluginAddress)
  },

  getActiveSettingByDaoAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network as NetworksEnum,
        daoAddress: ctx.params.daoAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
      },
      schemas: {
        params: SettingSchema.getSettingByDaoAddressV2,
      },
    })

    ctx.body = await SettingController.getActiveSettingByDaoAddress(
      result.params.daoAddress,
      result.params.network,
      result.params.pluginAddress,
    )
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} / Get Settings
     * @apiName Settings
     * @apiGroup Settings
     * @apiDescription Get Settings
     *
     * @apiSampleRequest /setting
     *
     */
    router.get('/', SettingRouter.getWithPagination)

    /**
     * @api {get} /active/:network/:daoAddress Get Active Setting by daoAddress
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Active Setting by daoAddress
     *
     * @apiSampleRequest /setting/active/:network/:daoAddress
     */
    router.get('/active/:network/:daoAddress', SettingRouter.getActiveSettingByDaoAddress)

    /**
     * @api {get} /active/:daoId Get Active Setting by daoId
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Active Setting by daoId
     *
     * @apiSampleRequest /setting/active/:daoId
     */
    router.get('/active/:daoId', SettingRouter.getActiveSettingByDaoId)

    return router
  },
}

export default SettingRouter
