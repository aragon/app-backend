import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@services/api/routers/schema/dao'
import { type HexAddress } from '@types'

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

  getDaoMembersMultiSigWithPagination: async function (ctx: RouterContext) {
    const filterParams: any = {
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    }

    const params = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.params.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoMultisigMembersWithPagination, { ...filterParams, ...params })

    ctx.body = await DaoController.getDaoMembersMultiSig(params.permalink, params.pluginAddress, filterParams)
  },

  getDaoMembersTokenVotingWithPagination: async function (ctx: RouterContext) {
    const filterParams: any = {
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    }

    const params = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.params.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoTokenVotingMembersWithPagination, {
      ...filterParams,
      ...params,
    })

    ctx.body = await DaoController.getDaoMembersTokenVoting(params.permalink, params.pluginAddress, filterParams)
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

    /**
     * @api {get} /:permalink Get Dao
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Dao
     *
     * @apiSampleRequest /:permalink
     */
    router.get('/:permalink', DaoRouter.getDaoByPermalink)

    /**
     * @api {get} /:permalink/multisig-members/:pluginAddress Get multisig members
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get multisig members
     *
     * @apiSampleRequest /:permalink/multisig-members/:pluginAddress
     */
    router.get('/:permalink/multisig-members/:pluginAddress', DaoRouter.getDaoMembersMultiSigWithPagination)

    /**
     * @api {get} /token-voting-members Get Dao token-voting-members
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Dao token-voting-members
     *
     * @apiSampleRequest /token-voting-members
     */
    router.get('/:permalink/token-voting-members/:pluginAddress', DaoRouter.getDaoMembersTokenVotingWithPagination)

    return router
  },
}

export default DaoRouter
