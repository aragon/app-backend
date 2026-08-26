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
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { SafeReadError } from '@modules/safe/safeError'
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
      Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 60,
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
   * Retries cover connection blips only - `skipRetry` sends anything that carried a status straight
   * to the caller, so a 4xx or an exhausted quota is answered once rather than five times.
   */
  async get<T>(network: NetworksEnum, path: string, params?: Record<string, unknown>): Promise<T> {
    if (!SafeTxServiceModule.isConfigured()) {
      throw new SafeReadError(ISafeErrorCode.notConfigured, 'No Safe API key is configured', 503)
    }

    const url = `${SafeTxServiceModule.baseUrl(network)}${path}`

    try {
      const response = await retryRequest(
        async () => BottleneckModule.getSafeApiLimiter().schedule(async () => axiosInstance.get<T>(url, { params })),
        { skipRetry: (error: unknown) => upstreamStatus(error) != null },
      )

      return response.data
    } catch (error: unknown) {
      if (SafeReadError.isSafeReadError(error)) throw error

      if (error instanceof Bottleneck.BottleneckError) {
        logger.warn('Safe: rejected, upstream queue is full', llo({ network, path }))
        throw new SafeReadError(ISafeErrorCode.rateLimited, 'Too many Safe reads in flight right now', 429, 10)
      }

      const classified = classify(error)
      logger.warn('Safe: upstream read failed', llo({ network, path, code: classified.code, error }))
      throw classified
    }
  },
}

export default SafeTxServiceModule
