import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import { type HexAddress, type IMemberExtraParams, type NetworksEnum } from '@types'

const MemberRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IMemberExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    await ValidationSchema.validateParams(MemberSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await MemberController.getMembersWithPagination(paginationParams, extraParams)
  },

  getMemberById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id, // address
    }

    const formattedValues = await ValidationSchema.validateParams(MemberSchema.getMemberById, params)

    ctx.body = await MemberController.getMemberById(formattedValues.id)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Members
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Members
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', MemberRouter.getWithPagination)

    /**
     * @api {get} /:id Get Member by id
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', MemberRouter.getMemberById)

    return router
  },
}

export default MemberRouter
