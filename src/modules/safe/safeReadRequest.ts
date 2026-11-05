import config from '@config'
import { assertExposable, isExposableError, throwExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import SafeCacheModule from '@modules/safe/safeCache'
import { SafeReadError } from '@modules/safe/safeError'
import {
  EnumQueueName,
  ErrorKeyEnum,
  getSafeShortName,
  type IQueueSafeRead,
  ISafeErrorCode,
  ISafeReadKind,
  SAFE_ERROR_KEY,
} from '@types'

/**
 * Sends one Safe read to `aragon-gateway` over RabbitMQ and turns its reply, or its silence, into an
 * API answer. The API has no RPC provider and no Safe API key; the gateway holds both, with the cache
 * and the hourly budget that protect the key.
 */
const SafeReadRequestModule = {
  getError(error: unknown): SafeReadError | null {
    if (!isExposableError(error)) return null
    const code = Object.values(ISafeErrorCode).find(code => SAFE_ERROR_KEY[code] === error.message)
    if (!code) return null
    return SafeReadError.fromQueueError({
      safeError: {
        code,
        error: error.description,
        status: error.status,
        retryAfter: error.exposeMeta?.retryAfter,
      },
    })
  },

  async send(params: IQueueSafeRead): Promise<unknown> {
    const { network, address, kind, limit, offset } = params

    // Reject before RabbitMQ for chains with no Safe Transaction Service. This is a first-class
    // answer, not a gateway outage, and avoids spending the request timeout on a queue that cannot
    // answer it.
    assertExposable(getSafeShortName(network) != null, ErrorKeyEnum.safeUnsupportedChain)

    if (kind === ISafeReadKind.info && (await SafeCacheModule.readInfoNotFound(network, address, Date.now()))) {
      throwExposable(ErrorKeyEnum.safeNotFound)
    }

    const result = await RabbitMQHelper.sendMessage(
      EnumQueueName.safeRead,
      {
        id: `safe-${kind}-${network}-${address}-${String(limit)}-${String(offset)}-${params.to ?? ''}-${params.nonceGte ?? ''}-${params.nonceLte ?? ''}`,
        params,
      },
      { waitResponse: true, timeout: config.RABBITMQ.TIMEOUT },
    )

    // Null means the consumer never replied - it is down, or the read outran the timeout.
    assertExposable(result != null, ErrorKeyEnum.safeConnectionError)

    // A reply always arrives as an object, so `safeError` - not the reply itself - marks the failure.
    if (typeof result === 'object' && 'safeError' in result) {
      const error = SafeReadError.fromQueueError(result)
      throwExposable(
        SAFE_ERROR_KEY[error.code],
        error.status,
        error.message,
        error.retryAfter == null ? undefined : { retryAfter: error.retryAfter },
      )
    }

    return result
  },
}

export default SafeReadRequestModule
