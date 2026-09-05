/**
 * Safe Transaction Service client.
 *
 * The only place in this repo that spends the shared Safe API key. Two reads need it and nothing
 * else does: the pending queue and the highest queued nonce exist offchain only, so no chain read
 * and no index can answer them. Everything a Safe body renders besides those comes from chain
 * (`@modules/safe/safeChainReader`) or from Aragon's own data (`/v2/assets`).
 *
 * Modelled on `@modules/tenderly`: axios instance, secret header, a shared Bottleneck limiter, and
 * `isConfigured()` so a deployment without a key degrades to a typed answer instead of a 500.
 */

import config from '@config'
import Utils from '@helpers/utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { SAFE_MAX_RETRY_AFTER_SECONDS, SafeReadError } from '@modules/safe/safeError'
import { getSafeShortName, ISafeErrorCode, type NetworksEnum } from '@types'
import axios from 'axios'
import Bottleneck from 'bottleneck'

const llo = logger.logMeta.bind(null, { service: 'safe-tx-service' })

const axiosInstance = axios.create({
  timeout: config.SAFE_API.TIMEOUT,
  headers: {
    Authorization: `Bearer ${config.SAFE_API.API_KEY}`,
    'Content-Type': 'application/json',
  },
})

/** The HTTP status of a failed call, or undefined when the request never got an answer. */
function upstreamStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

/**
 * Retries a request that never got an answer, and only that.
 *
 * Anything carrying an HTTP status is final: a 4xx will not change, and a 429 must reach the caller
 * so it can honour `Retry-After` rather than spending the quota that just ran out. A rejection from
 * the limiter is final too - the queue is already full, so waiting to add to it is pointless.
 */
async function withConnectionRetry<T>(attempt: () => Promise<T>): Promise<T> {
  const maxAttempts = config.RETRY_REQUEST.COUNT
  let lastError: unknown

  for (let tries = 0; tries < maxAttempts; tries += 1) {
    try {
      return await attempt()
    } catch (error: unknown) {
      lastError = error

      // Final: a status will not change on a retry, an already-classified failure has been decided,
      // and a full limiter queue is not helped by adding to it.
      if (
        upstreamStatus(error) != null ||
        SafeReadError.isSafeReadError(error) ||
        error instanceof Bottleneck.BottleneckError
      ) {
        throw error
      }

      const isLastAttempt = tries === maxAttempts - 1
      if (isLastAttempt) break

      await Utils.wait(2 ** tries * 1000)
    }
  }

  throw lastError
}

/**
 * Turn a transport failure into the vocabulary the app already handles.
 *
 * A 429 is never retried into the wall: the upstream `Retry-After` is handed to the caller so it can
 * back its own poll off. Retrying would spend the very quota that just ran out, and the exponential
 * backoff would outlive `RABBITMQ.TIMEOUT` anyway.
 */
function classify(error: unknown): SafeReadError {
  const status = upstreamStatus(error)

  if (status === 429) {
    const header = axios.isAxiosError(error) ? error.response?.headers['retry-after'] : undefined
    const parsed = Number(header)

    return new SafeReadError(
      ISafeErrorCode.rateLimited,
      'Safe transaction service rate limit reached',
      429,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.ceil(parsed), SAFE_MAX_RETRY_AFTER_SECONDS) : 60,
    )
  }

  if (status === 404) {
    return new SafeReadError(ISafeErrorCode.notFound, 'Safe not found on the transaction service', 404)
  }

  if (status == null) {
    return new SafeReadError(ISafeErrorCode.connectionError, 'Safe transaction service is unreachable', 502)
  }

  return new SafeReadError(
    ISafeErrorCode.upstreamError,
    `Safe transaction service answered ${String(status)}`,
    status >= 500 ? 502 : status,
  )
}

const SafeTxServiceModule = {
  isConfigured(): boolean {
    return !!config.SAFE_API.API_KEY
  },

  /**
   * `https://api.safe.global/tx-service/<shortName>/api` - the chain is addressed by Safe's short
   * name, not by chain id. A network with no short name has no service at all.
   */
  baseUrl(network: NetworksEnum): string {
    const shortName = getSafeShortName(network)

    if (!shortName) {
      throw new SafeReadError(
        ISafeErrorCode.unsupportedChain,
        `${network} is not served by the Safe transaction service`,
        501,
      )
    }

    return `${config.SAFE_API.BASE_URI}/${shortName}/api`
  },

  /**
   * One GET against the transaction service, through the shared limiter.
   *
   * Retries connection failures only. Deliberately **not** `retryRequest`: that helper matches
   * `[429, 502]` *before* it consults `skipRetry`, so an exhausted quota would be retried
   * `RETRY_REQUEST.COUNT` times over ~31s of backoff - spending the quota that just ran out,
   * outliving `RABBITMQ.TIMEOUT`, and underreporting `upstreamCalls` by counting one call where
   * five were made. Anything that carried an HTTP status is final here, which is what the
   * classification below already assumes.
   */
  async get<T>(network: NetworksEnum, path: string, params?: Record<string, unknown>): Promise<T> {
    if (!SafeTxServiceModule.isConfigured()) {
      throw new SafeReadError(ISafeErrorCode.notConfigured, 'No Safe API key is configured', 503)
    }

    const url = `${SafeTxServiceModule.baseUrl(network)}${path}`

    try {
      const response = await withConnectionRetry(async () =>
        BottleneckModule.getSafeApiLimiter().schedule(async () => axiosInstance.get<T>(url, { params })),
      )

      return response.data
    } catch (error: unknown) {
      if (SafeReadError.isSafeReadError(error)) throw error

      if (error instanceof Bottleneck.BottleneckError) {
        logger.warn('Safe: rejected, upstream queue is full', llo({ network, path }))
        // Never reached the Safe API, so the caller's hourly budget unit is refundable.
        throw new SafeReadError(ISafeErrorCode.rateLimited, 'Too many Safe reads in flight right now', 429, 10, false)
      }

      const classified = classify(error)
      logger.warn('Safe: upstream read failed', llo({ network, path, code: classified.code, error }))
      throw classified
    }
  },
}

export default SafeTxServiceModule
