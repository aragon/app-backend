import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/aragon-api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DaoSchema from '@services/aragon-api/routers/schema/dao'
import { type HexAddress, type IDaoExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'metrics.tvlUSD' })
    const extraParams: IDaoExtraParams = {
      networks: ctx.query.networks as [NetworksEnum],
      address: ctx.query.address as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...paginationParams, ...extraParams }, ctx.query)

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(DaoSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DaoController.getDaosWithPagination(formattedPaginationParams, formattedExtraParams)
  },

  getDaoByMemberAddress: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'metrics.tvlUSD' })
    const extraParams = {
      memberAddress: ctx.params.address,
      network: ctx.query.network,
      networks: ctx.query.networks as [NetworksEnum],
      excludeDaoId: ctx.query.excludeDaoId,
    }

    const anyInvalidParams = Utils.extractAdditionalParams({ ...paginationParams, ...extraParams }, ctx.query)

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(DaoSchema.getDaosByMember, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DaoController.getDaosByMember(formattedPaginationParams, formattedExtraParams)
  },

  getDaoById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({}, ctx.query)

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(DaoSchema.getDaoById, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DaoController.getDaoById(formattedValues.id)
  },

  getDaoByAddress: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      address: ctx.params.address,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({}, ctx.query)

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(DaoSchema.getDaoByAddress, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DaoController.getDaoByAddress(formattedValues.address, formattedValues.network)
  },

  getDaoByEns: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      ens: ctx.params.ens,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({}, ctx.query)

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(DaoSchema.getDaoByEns, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DaoController.getDaoByEns(formattedValues.ens, formattedValues.network)
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
     * @api {get} /:id Get Dao by id
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by id
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', DaoRouter.getDaoById)

    /**
     * @api {get} /:address/member/:address Get Dao By Member Address
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao By Member Address
     *
     * @apiSampleRequest /:address/member/:address
     */

    router.get('/member/:address', DaoRouter.getDaoByMemberAddress)

    /**
     * @api {get} /:network/:address Get Dao by address
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by address
     *
     * @apiSampleRequest /:network/:address
     */
    router.get('/:network/:address', DaoRouter.getDaoByAddress)

    /**
     * @api {get} /:network/ens/:ens Get Dao by ENS
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by ENS
     *
     * @apiSampleRequest /:network/ens/:ens
     */
    router.get('/:network/ens/:ens', DaoRouter.getDaoByEns)

    return router
  },
}

export default DaoRouter
