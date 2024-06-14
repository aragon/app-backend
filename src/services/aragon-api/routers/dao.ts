import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/aragon-api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DaoSchema from '@services/aragon-api/routers/schema/dao'
import { type HexAddress } from '@types'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx)
    const filterParams = {
      pluginAddress: ctx.query.pluginAddress,
      network: ctx.query.network,
    }

    await ValidationSchema.validateParams(DaoSchema.getWithPagination, {
      ...paginationParams,
      ...filterParams,
    })

    ctx.body = await DaoController.getDaosWithPagination(paginationParams, filterParams)
  },

  getDaoByPermalink: async function (ctx: RouterContext) {
    const params = {
      permalink: ctx.params.permalink,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoByPermalink, params)

    ctx.body = await DaoController.getDaoByPermalink(params.permalink)
  },

  getDaoPlugin: async function (ctx: RouterContext) {
    const params = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.params.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoPlugin, params)

    ctx.body = await DaoController.getDaoPlugin({
      permalink: params.permalink,
      pluginAddress: params.pluginAddress,
    })
  },

  getDaoMembersWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const filterParams = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoMembersWithPagination, {
      ...paginationParams,
      ...filterParams,
    })

    ctx.body = await DaoController.getDaoMembersWithPagination(paginationParams, filterParams)
  },

  getProposalsWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'proposalId' })
    const filterParams = {
      permalink: ctx.params.permalink,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(DaoSchema.getProposalsWithPagination, {
      ...paginationParams,
      ...filterParams,
    })

    ctx.body = await DaoController.getDaoProposalsWithPagination(paginationParams, filterParams)
  },

  getAssetsWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'amountUsd' })
    const filterParams = {
      permalink: ctx.params.permalink,
    }

    await ValidationSchema.validateParams(DaoSchema.getAssetsWithPagination, { ...paginationParams, ...filterParams })

    ctx.body = await DaoController.getDaoAssetsWithPagination(paginationParams, filterParams)
  },

  getTransactionsWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const filterParams = {
      permalink: ctx.params.permalink,
    }

    await ValidationSchema.validateParams(DaoSchema.getTransactionsWithPagination, {
      ...paginationParams,
      ...filterParams,
    })

    ctx.body = await DaoController.getDaoTransactionsWithPagination(paginationParams, filterParams)
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
     * @api {get} /:permalink/members Get members by plugin
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao members
     *
     * @apiSampleRequest /:permalink/members
     */
    router.get('/:permalink/members', DaoRouter.getDaoMembersWithPagination)

    /**
     * @api {get}  /:permalink/proposals Get dao proposals
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao proposals
     *
     * @apiSampleRequest /:permalink/proposals
     */
    router.get('/:permalink/proposals', DaoRouter.getProposalsWithPagination)

    /**
     * @api {get}  /:permalink/assets Get dao assets
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao assets
     *
     * @apiSampleRequest /:permalink/assets
     */
    router.get('/:permalink/assets', DaoRouter.getAssetsWithPagination)

    /**
     * @api {get}  /:permalink/transactions Get dao transactions
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao transactions
     *
     * @apiSampleRequest /:permalink/transactions
     */
    router.get('/:permalink/transactions', DaoRouter.getTransactionsWithPagination)

    /**
     * @api {get} /:permalink/plugins/:pluginAddress Get dao plugin
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get dao plugin
     *
     * @apiSampleRequest /:permalink/plugins/:pluginAddress
     */
    router.get('/:permalink/plugins/:pluginAddress', DaoRouter.getDaoPlugin)

    return router
  },
}

export default DaoRouter
