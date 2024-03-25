import Router, { type RouterContext } from '@koa/router'
import DaoController from '@services/api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@services/api/routers/schema/dao'
import { type HexAddress, type NetworksEnum } from '@types'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const params: any = {
      search: ctx.query.search,
      limit: ctx.query.limit || 10,
      order: ctx.query.order || 'desc',
      skip: ctx.query.skip || 0,
      orderProp: ctx.query.orderProp,
      fromDate: ctx.query.fromDate,
      toDate: ctx.query.toDate,
      network: ctx.query.network,
      plugin: ctx.query.plugin,
    }

    const formattedParams = await ValidationSchema.validateParams(DaoSchema.getWithPagination, params)

    ctx.body = await DaoController.getWithPagination(formattedParams)
  },

  getDaoByAddressAndNetwork: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.address as HexAddress,
      network: ctx.params.network as NetworksEnum,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoByAddressAndNetwork, params)

    ctx.body = await DaoController.getDao(params.network, params.address)
  },

  getDaoMembersMultiSigWithPagination: async function (ctx: RouterContext) {
    const filterParams: any = {
      limit: ctx.query.limit || 10,
      skip: ctx.query.skip || 0,
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    }

    const params = {
      address: ctx.params.address as HexAddress,
      network: ctx.params.network as NetworksEnum,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoMultisigMembersWithPagination, { ...filterParams, ...params })

    ctx.body = await DaoController.getDaoMembersMultiSig(params.network, params.address, filterParams)
  },

  getDaoMembersTokenVotingWithPagination: async function (ctx: RouterContext) {
    const filterParams: any = {
      limit: ctx.query.limit || 10,
      skip: ctx.query.skip || 0,
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    }

    const params = {
      address: ctx.params.address as HexAddress,
      network: ctx.params.network as NetworksEnum,
    }

    await ValidationSchema.validateParams(DaoSchema.getDaoTokenVotingMembersWithPagination, {
      ...filterParams,
      ...params,
    })

    ctx.body = await DaoController.getDaoMembersTokenVoting(params.network, params.address, filterParams)
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
     * @api {get} /:address/:network Get Dao
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Dao
     *
     * @apiSampleRequest /:address/:network
     */
    router.get('/:address/:network', DaoRouter.getDaoByAddressAndNetwork)

    /**
     * @api {get} /multisig-members Get Dao multisig-members
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Dao multisig-members
     *
     * @apiSampleRequest /multisig-members
     */
    router.get('/multisig-members/:address/:network', DaoRouter.getDaoMembersMultiSigWithPagination)

    /**
     * @api {get} /token-voting-members Get Dao token-voting-members
     * @apiName Dao
     * @apiGroup Dao
     * @apiDescription Get Dao token-voting-members
     *
     * @apiSampleRequest /token-voting-members
     */
    router.get('/token-voting-members/:address/:network', DaoRouter.getDaoMembersTokenVotingWithPagination)

    return router
  },
}

export default DaoRouter
