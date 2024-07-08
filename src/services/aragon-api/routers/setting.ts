import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import SettingSchema from '@api/routers/schema/setting'
import SettingController from '@api/controllers/setting'
import { type HexAddress, type ISettingExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const SettingRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultOrder: 'amountUsd' })
    const extraParams: ISettingExtraParams = {
      onlyActive: ctx.query.onlyActive ? Boolean(ctx.query.onlyActive) : undefined,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(SettingSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(SettingSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await SettingController.getSettingsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
  },

  getActiveSettingByDaoId: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.daoId,
    }

    const formattedValues = await ValidationSchema.validateParams(SettingSchema.getDaoById, params)

    ctx.body = await SettingController.getActiveSettingByDaoId(formattedValues.id)
  },

  getActiveSettingByDaoAddress: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network as NetworksEnum,
      daoAddress: ctx.params.daoAddress,
    }

    const formattedValues = await ValidationSchema.validateParams(SettingSchema.getSettingByDaoAddress, params)

    ctx.body = await SettingController.getActiveSettingByDaoAddress(formattedValues.daoAddress, formattedValues.network)
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

    /**
     * @api {get} /active/:network/:daoAddress Get Active Setting by daoAddress
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Active Setting by daoAddress
     *
     * @apiSampleRequest /active/:network/:daoAddress
     */
    router.get('/active/:network/:daoAddress', SettingRouter.getActiveSettingByDaoAddress)

    /**
     * @api {get} /active/:daoId Get Active Setting by daoId
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Active Setting by daoId
     *
     * @apiSampleRequest /active/:daoId
     */
    router.get('/active/:daoId', SettingRouter.getActiveSettingByDaoId)

    return router
  },
}

export default SettingRouter
