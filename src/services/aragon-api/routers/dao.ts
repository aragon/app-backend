import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/aragon-api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@services/aragon-api/routers/schema/dao'
import { type HexAddress, IPluginSubdomain } from '@types'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const params: any = {
      search: ctx.query.search,
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
      fromDate: ctx.query.fromDate,
      toDate: ctx.query.toDate,
      network: ctx.query.network,
      pluginAddress: ctx.query.pluginAddress,
    }

    const formattedParams = await ValidationSchema.validateParams(DaoSchema.getWithPagination, params)

    ctx.body = await DaoController.getWithPagination(formattedParams)
  },

  getDaoByPermalink: async function (ctx: RouterContext) {
    const params = {
      permalink: ctx.params.permalink,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoByPermalink, params)

    ctx.body = await DaoController.getDaoByPermalink(params.permalink)
  },

  getDaoMembersWithPagination: async function (ctx: RouterContext) {
    const filterParams: any = {
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp || 'blockNumber',
    }

    const params = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.params.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoMembersWithPagination, { ...filterParams, ...params })
    const subdomain = (ctx.path.includes('/multisig-members/')) ? IPluginSubdomain.multisig : IPluginSubdomain.token

    ctx.body = await DaoController.getDaoMembers({
      permalink: params.permalink,
      pluginAddress: params.pluginAddress,
      subdomain,
      filterParams,
    })
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
    router.get('/:permalink', DaoRouter.getDaoByPermalink)

    /**
     * @api {get} /:permalink/[plugin]-members/:pluginAddress Get members by plugin subdomain
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao members
     *
     * @apiSampleRequest /:permalink/multisig-members/:pluginAddress
     */
    router.get('/:permalink/multisig-members/:pluginAddress', DaoRouter.getDaoMembersWithPagination)
    router.get('/:permalink/token-members/:pluginAddress', DaoRouter.getDaoMembersWithPagination)

    return router
  },
}

export default DaoRouter
