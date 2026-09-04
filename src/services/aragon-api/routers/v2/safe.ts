import SafeController from '@api/controllers/safe'
import SafeSchema from '@api/routers/schema/safe'
import { SAFE_CACHE_CONTROL_HEADERS, SAFE_NO_CACHE_CONTROL_HEADERS } from '@config'
import ValidationSchema from '@helpers/validationSchema'
import { SafeReadError } from '@modules/safe/safeError'
import Router, { type RouterContext } from '@koa/router'
import { type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

/**
 * Reads for a Safe used as a governance body.
 *
 * Failures are rendered here rather than by the global error middleware. The app's Safe client parses
 * `{ error, code, retryAfter }` with a kebab-case code vocabulary, and the repo-wide envelope is
 * `{ code, description, status, meta }` with `ErrorKeyEnum` codes. Bending every other route's shape
 * to fit one client is worse than one router owning its own error body.
 */
async function respond(ctx: RouterContext, handler: () => Promise<unknown>) {
  try {
    ctx.body = await handler()
  } catch (error) {
    if (!SafeReadError.isSafeReadError(error)) throw error

    ctx.status = error.status
    ctx.body = { error: error.message, code: error.code, retryAfter: error.retryAfter }
    ctx.set('Cache-Control', SAFE_NO_CACHE_CONTROL_HEADERS)
  }
}

/**
 * Addresses are checksummed on entry and the checksummed form is what reaches the cache key and the
 * upstream call. Both sides need this: the transaction service answers 422 for any other form, and
 * this repo's own `sppBodyCondition` hands back *lowercased* Safe addresses.
 */
async function safeParams(ctx: RouterContext) {
  const result = await ValidationSchema.validateRoute(ctx, {
    params: {
      network: ctx.params.network as NetworksEnum,
      address: ctx.params.address as string,
    },
    schemas: { params: SafeSchema.safeAddress },
  })

  return { network: result.params.network as NetworksEnum, address: getAddress(result.params.address as string) }
}

const SafeRouter = {
  async getInfo(ctx: RouterContext) {
    const { network, address } = await safeParams(ctx)

    await respond(ctx, async () => SafeController.getInfo(network, address))
    if (ctx.status < 400) ctx.set('Cache-Control', SAFE_CACHE_CONTROL_HEADERS)
  },

  async getQueue(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network as NetworksEnum,
        address: ctx.params.address as string,
      },
      extraParams: {
        limit: ctx.query.limit,
        offset: ctx.query.offset,
      },
      schemas: { params: SafeSchema.safeAddress, extra: SafeSchema.queuePagination },
    })

    const network = result.params.network as NetworksEnum
    const address = getAddress(result.params.address as string)
    const { limit, offset } = result.extraParams as { limit: number; offset: number }

    await respond(ctx, async () => SafeController.getQueue(network, address, limit, offset))
    if (ctx.status < 400) ctx.set('Cache-Control', SAFE_CACHE_CONTROL_HEADERS)
  },

  async getNextNonce(ctx: RouterContext) {
    const { network, address } = await safeParams(ctx)

    await respond(ctx, async () => SafeController.getNextNonce(network, address))
    // Uncached everywhere, not only in Mongo. The nonce is bound into the EIP-712 `safeTxHash`, so a
    // value served from any cache - ours, a CDN's, the browser's - can allocate a colliding nonce.
    ctx.set('Cache-Control', SAFE_NO_CACHE_CONTROL_HEADERS)
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} /safe/:network/:address/info Get Safe info
     * @apiName SafeInfo
     * @apiGroup Safe
     * @apiDescription Owners, threshold, version, onchain nonce, modules and guard of a Safe, read
     * from chain. Never touches the Safe transaction service.
     *
     * @apiSampleRequest /safe/:network/:address/info
     */
    router.get('/:network/:address/info', SafeRouter.getInfo)

    /**
     * @api {get} /safe/:network/:address/queue Get Safe queue
     * @apiName SafeQueue
     * @apiGroup Safe
     * @apiDescription Unexecuted transactions of a Safe, from the Safe transaction service through a
     * shared cache. Not filtered by nonce - the client derives liveness from the nonce it holds.
     *
     * @apiSampleRequest /safe/:network/:address/queue
     */
    router.get('/:network/:address/queue', SafeRouter.getQueue)

    /**
     * @api {get} /safe/:network/:address/next-nonce Get next free Safe nonce
     * @apiName SafeNextNonce
     * @apiGroup Safe
     * @apiDescription The nonce a new Safe transaction must occupy. Both inputs are read fresh and
     * this endpoint never consults a cache.
     *
     * @apiSampleRequest /safe/:network/:address/next-nonce
     */
    router.get('/:network/:address/next-nonce', SafeRouter.getNextNonce)

    return router
  },
}

export default SafeRouter
