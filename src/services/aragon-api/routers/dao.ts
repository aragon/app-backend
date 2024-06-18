import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/aragon-api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DaoSchema from '@services/aragon-api/routers/schema/dao'
import { type HexAddress, type IDaoExtraParams, type NetworksEnum } from '@types'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx)
    const extraParams: IDaoExtraParams = {
      network: ctx.query.network as NetworksEnum,
      address: ctx.query.address as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await DaoController.getDaosWithPagination(paginationParams, extraParams)
  },

  getDaoById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }

    const formattedValues = await ValidationSchema.validateParams(DaoSchema.getDaoById, params)

    ctx.body = await DaoController.getDaoById(formattedValues.id)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Daos
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Daos
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', DaoRouter.getWithPagination)

    /**
     * @api {get} /:permalink Get Dao by permalink
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao
     *
     * @apiSampleRequest /:permalink
     */
    router.get('/:id', DaoRouter.getDaoById)

    return router
  },
}

export default DaoRouter
