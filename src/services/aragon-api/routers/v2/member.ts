import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const MemberV2Router = {
  isMemberOfPlugin: async function (ctx: RouterContext) {
    const params = {
      memberAddress: ctx.params.memberAddress,
      pluginAddress: ctx.params.pluginAddress,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...params }, ctx.query)

    const [formattedParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.isMemberOfPlugin, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    const status = await MemberController.isMemberOfPlugin(formattedParams.memberAddress, formattedParams.pluginAddress)
    ctx.body = { status }
  },

  router() {
    const router = new Router()

    /**
     * @api {get} /:memberAddress/:pluginAddress/exists isMemberOfPlugin
     * @apiName Members
     * @apiGroup Members
     * @apiDescription isMemberOfPlugin
     *
     * @apiSampleRequest /member/:memberAddress/:pluginAddress/exists
     */
    router.get('/:memberAddress/:pluginAddress/exists', MemberV2Router.isMemberOfPlugin)

    return router
  },
}

export default MemberV2Router
