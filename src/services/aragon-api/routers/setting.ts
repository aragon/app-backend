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
      onlyActive: ctx.query.onlyActive ? Boolean(ctx.query.onlyActive) : undefined,
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

  getSettingById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(SettingSchema.getSettingById, params)

    ctx.body = await SettingController.getSettingById(formattedValues.id)
  },

  getSettingByTransactionHash: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      fromTxHash: ctx.params.transactionHash,
    }

    const formattedValues = await ValidationSchema.validateParams(SettingSchema.getSettingByTransactionHash, params)

    ctx.body = await SettingController.getSettingByTransactionHash(formattedValues.fromTxHash, formattedValues.network)
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
     * @api {get} /:id Get Settings by id
     * @apiName Settings
     * @apiGroup Settings
     * @apiDescription Get Setting by id
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', SettingRouter.getSettingById)

    /**
     * @api {get} /:network/:transactionHash Get Setting by transactionHash
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Setting by transactionHash
     *
     * @apiSampleRequest /:network/:transactionHash
     */
    router.get('/:network/:transactionHash', SettingRouter.getSettingByTransactionHash)

    return router
  },
}

export default SettingRouter
