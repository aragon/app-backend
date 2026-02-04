import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import PolicySchema from '@api/routers/schema/policy'
import PolicyController from '@api/controllers/policy'

const PolicyRouter = {
  async getPoliciesByDao(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        daoAddress: ctx.params.daoAddress,
        onlyParent: ctx.query.onlyParent === 'true',
      },
      schemas: {
        params: PolicySchema.getPoliciesByDaoUrlParams,
      },
    })

    ctx.body = await PolicyController.getPoliciesByDao({
      network: result.params.network,
      daoAddress: result.params.daoAddress,
      onlyParent: result.params.onlyParent,
    })
  },

  router(): Router {
    const router = new Router()

    router.get('/:network/:daoAddress', PolicyRouter.getPoliciesByDao)

    return router
  },
}

export default PolicyRouter
