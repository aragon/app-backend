/**
 * Gateway side of a Safe body read.
 *
 * The API cannot do this work itself: `aragon-api` declares
 * `NEED_CONNECTIONS: [MONGODB, RABBITMQ]` and has no blockchain connection, so a contract read there
 * is impossible. Routing through the gateway also keeps the one outbound Safe API call out of an
 * HTTP request path and next to the cache and counter that protect it.
 *
 * A handler cannot throw across the queue, so a typed failure is answered as data and the API
 * controller turns it back into a status. Same shape as the cross-chain gas queue.
 */

import logger from '@logger'
import { SafeReadError } from '@modules/safe/safeError'
import SafeServiceModule from '@modules/safe/safeService'
import { ISafeErrorCode, type IQueueSafeRead, type ISafeReadResult, ISafeReadKind } from '@types'

const llo = logger.logMeta.bind(null, { service: 'gateway:Safe' })

export const SafeGateway = {
  async read(params: IQueueSafeRead): Promise<ISafeReadResult> {
    const { network, address, kind, limit, offset } = params

    try {
      switch (kind) {
        case ISafeReadKind.info:
          return await SafeServiceModule.readInfo(network, address)
        case ISafeReadKind.queue:
          return await SafeServiceModule.readQueue(network, address, limit ?? 20, offset ?? 0)
        case ISafeReadKind.nextNonce:
          return await SafeServiceModule.readNextNonce(network, address)
        default:
          return new SafeReadError(
            ISafeErrorCode.upstreamError,
            `Unknown Safe read kind ${String(kind)}`,
            400,
          ).toQueueError()
      }
    } catch (error) {
      if (SafeReadError.isSafeReadError(error)) return error.toQueueError()

      logger.error('Safe: read failed unexpectedly', llo({ network, address, kind, error }))

      return new SafeReadError(ISafeErrorCode.upstreamError, 'The Safe read could not be completed', 502).toQueueError()
    }
  },
}
