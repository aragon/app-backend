import Router, { type RouterContext } from '@koa/router'
import ProposalCtrl from '@api/controllers/proposal'

import { type HexAddress, type IPaginationParams } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import ProposalSchema from '@api/routers/schema/proposal'

// @ts-ignore
const ProposalRouter = {
  getByDao: async function (ctx: RouterContext) {
    // @ts-expect-error
    const queryParams = {
      search: ctx.query.search,
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    } as IPaginationParams

    const params = {
      permalink: ctx.params.permalink,
      ...queryParams,
    }

    await ValidationSchema.validateParams(ProposalSchema.getByDao, params)

    ctx.body = await ProposalCtrl.getByDao(params)
  },

  getByMember: async function (ctx: RouterContext) {
    // @ts-expect-error
    const queryParams = {
      search: ctx.query.search,
      limit: Number(ctx.query.limit || 10),
      skip: Number(ctx.query.skip || 0),
      order: ctx.query.order || 'desc',
      orderProp: ctx.query.orderProp,
    } as IPaginationParams

    const params = {
      ...queryParams,
      permalink: ctx.params.permalink,
      memberAddress: ctx.params.memberAddress as HexAddress,
    }

    await ValidationSchema.validateParams(ProposalSchema.getByMember, params)

    ctx.body = await ProposalCtrl.getByMember(params)
  },

  router() {
    const router = new Router()

    router.get('/dao/:permalink', this.getByDao)
    router.get('/dao/:permalink/member/:memberAddress', this.getByMember)

    return router
  },
}

export default ProposalRouter
