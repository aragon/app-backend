import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@services/api/routers/schema/dao'

const DaoRouter = {
  getWithPagination: async function(ctx: RouterContext) {
    const params: any = {
      search: ctx.query.search,
      limit: ctx.query.limit || 10,
      order: ctx.query.order || 'desc',
      offset: ctx.query.offset || 1,
      orderProp: ctx.query.orderProp,
      fromDate: ctx.query.fromDate,
      toDate: ctx.query.toDate,
      network: ctx.query.network,
      plugin: ctx.query.plugin,
    }

    const formattedParams = await ValidationSchema.validateParams(
      DaoSchema.getWithPagination,
      params,
    )

    ctx.body = await DaoController.getWithPagination(formattedParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Daos
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Daos
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', DaoRouter.getWithPagination)

    return router
  },
}

export default DaoRouter
