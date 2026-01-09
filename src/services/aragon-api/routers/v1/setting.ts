import SettingController from '@api/controllers/setting'
import PaginationSchema from '@api/routers/schema/pagination'
import SettingSchema from '@api/routers/schema/setting'
import Utils from '@helpers/utils'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import ModelUtils from '@models/utils/models'
import { type HexAddress, type IPairParams, type ISettingExtraParams, type NetworksEnum } from '@types'

const SettingRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: ISettingExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(SettingSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await SettingController.getSettingsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
  },

  getActiveSettingByDaoId: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.daoId,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      {
        pluginAddress: ctx.query.pluginAddress,
      },
      ctx.query,
    )

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(SettingSchema.getDaoById, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await SettingController.getActiveSettingByDaoId(formattedValues.id, formattedValues.pluginAddress)
  },

  getActiveSettingByDaoAddress: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network as NetworksEnum,
      daoAddress: ctx.params.daoAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      {
        pluginAddress: ctx.query.pluginAddress,
      },
      ctx.query,
    )

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(SettingSchema.getSettingByDaoAddress, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await SettingController.getActiveSettingByDaoAddress(
      formattedValues.daoAddress,
      formattedValues.network,
      formattedValues.pluginAddress,
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
