import IpfsController from '@api/controllers/ipfs'
import IpfsSchema from '@api/routers/schema/ipfs'
import { CACHE_CONTROL_HEADERS } from '@config'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

const IpfsRouter = {
  getDelegateStatement: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        cid: ctx.params.cid as string,
      },
      schemas: {
        params: IpfsSchema.getDelegateStatement,
      },
    })

    ctx.body = await IpfsController.getDelegateStatement(result.params.cid)
    ctx.set('Cache-Control', CACHE_CONTROL_HEADERS)
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} /ipfs/delegate-statement/:cid Get delegate statement from IPFS
     * @apiName IPFS
     * @apiGroup IPFS
     * @apiDescription Resolves an IPFS-hosted delegate statement by CID with Pinata → public IPFS → dweb fallback.
     *
     * @apiSampleRequest /ipfs/delegate-statement/:cid
     */
    router.get('/delegate-statement/:cid', IpfsRouter.getDelegateStatement)

    return router
  },
}

export default IpfsRouter
