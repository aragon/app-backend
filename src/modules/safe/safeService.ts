/**
 * Safe body reads, served the cheapest correct way.
 *
 * Runs in `aragon-gateway`, which is the only service holding both RPC providers and Mongo. The API
 * hands a read over RabbitMQ exactly as it already does for `contractInfo`, so no upstream call and
 * no chain read ever happens inside an HTTP handler.
 *
 * Three reads, three different rules:
 *
 * - `info` (owners / threshold / version / onchain nonce / modules / guard) is chain state. It never
 *   touches the Safe API at all, which removes one of the two read kinds a Safe body used to poll.
 * - `queue` is the one read that genuinely needs the Safe API: queued-but-unexecuted transactions
 *   exist offchain only. Shared process cache, hourly counter, fail open on stale.
 * - `next-nonce` is never cached, on any code path. The nonce is bound into the EIP-712 `safeTxHash`
 *   and cannot be changed once signatures exist, so a stale input recreates the colliding-nonce bug
 *   this work exists to fix. Both of its inputs are read fresh, together, and it fails rather than
 *   answering from anything older.
 */

import config from '@config'
import logger from '@logger'
import SafeCacheModule from '@modules/safe/safeCache'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { SafeReadError } from '@modules/safe/safeError'
import { highestQueuedNonce, parseQueuePage } from '@modules/safe/safeQueueParser'
import SafeTxServiceModule from '@modules/safeTxService'
import {
  getSafeShortName,
  ISafeErrorCode,
  type ISafeInfoResponse,
  type ISafeNextNonceResponse,
  ISafeReadKind,
  type ISafeQueueResponse,
  type ISafeMultisigTransaction,
  ISafeSource,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-service' })

/**
 * Joins reads that are in flight *right now, in this process*. The gateway module cache is what makes cost
 * scale with Safes instead of viewers; this only stops one worker from firing the
 * same upstream call twice while the first is still open.
 */
const inFlight = new Map<string, Promise<unknown>>()

/**
 * The discovery deliverable: what a real month actually costs.
 *
 * One line per read, with the dimensions the tier decision needs - chain, read kind, whether the
 * shared cache answered it, and whether an upstream call was actually spent. Enforcement can follow
 * once the number is known; guessing at a limit we may raise next week cannot.
 */
function recordUsage(fields: {
  network: NetworksEnum
  kind: ISafeReadKind
  cache: 'hit' | 'stale' | 'miss' | 'bypass'
  upstreamCalls: number
  stale: boolean
  freshMarked: boolean
}) {
  logger.info('safe.usage', llo(fields))
}

function assertSupported(network: NetworksEnum) {
  if (getSafeShortName(network)) return

  // 501, never a 5xx: the app renders a dedicated state for it. `info` could technically be answered
  // from chain here, but a Safe body with no reachable queue cannot be signed from, so answering
  // half of it would only render a broken body.
  throw new SafeReadError(
    ISafeErrorCode.unsupportedChain,
    `${network} is not served by the Safe transaction service`,
    501,
  )
}

/** One upstream queue page, budget-counted, validated against the wire contract. */
async function fetchQueuePage(network: NetworksEnum, address: string, params: Record<string, unknown>) {
  if (!SafeCacheModule.consumeBudget(Date.now())) {
    throw new SafeReadError(ISafeErrorCode.rateLimited, 'Safe read budget for this hour is used up', 429, 300)
  }

  const page = parseQueuePage(
    await SafeTxServiceModule.get(network, `/v2/safes/${address}/multisig-transactions/`, params),
  )

  if (page == null) {
    throw new SafeReadError(
      ISafeErrorCode.invalidResponse,
      'Safe queue response did not match the expected contract',
      502,
    )
  }

  return page
}

/**
 * Read every live queue page for next-nonce. The `nonce__gte` filter is safe here because this
 * read is never cached: it removes transactions that are already below the live chain nonce, without
 * poisoning a cache key. The scan remains uncached and uses BigInt after parsing, so the answer stays
 * correct for every live queue size and every uint256 nonce.
 */
async function fetchAllQueueTransactions(
  network: NetworksEnum,
  address: string,
  currentNonce: string,
): Promise<{ transactions: ISafeMultisigTransaction[]; pages: number }> {
  const limit = config.SAFE_API.NEXT_NONCE_SCAN_LIMIT
  const transactions: ISafeMultisigTransaction[] = []
  let offset = 0
  let pages = 0

  while (true) {
    const page = await fetchQueuePage(network, address, {
      executed: false,
      nonce__gte: currentNonce,
      limit,
      offset,
    })
    transactions.push(...page.results)
    pages += 1

    if (page.results.length === 0 || transactions.length >= page.count) return { transactions, pages }

    offset += page.results.length
  }
}

const SafeServiceModule = {
  /**
   * Chain state, cached in the gateway module. On a chain-read failure an entry still inside the stale window is
   * served with `meta.stale`, because a slightly old threshold is worth far more to a reader than an
   * error page.
   */
  async readInfo(network: NetworksEnum, rawAddress: string): Promise<ISafeInfoResponse> {
    assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()
    const key = SafeCacheModule.key(network, address, ISafeReadKind.info)

    const cached = SafeCacheModule.read<ISafeInfoResponse>(key, now)
    if (cached?.fresh) {
      recordUsage({
        network,
        kind: ISafeReadKind.info,
        cache: 'hit',
        upstreamCalls: 0,
        stale: false,
        freshMarked: false,
      })
      return cached.result
    }

    try {
      const info = await SafeChainReaderModule.readInfo(network, address)
      const response: ISafeInfoResponse = {
        ...info,
        meta: { source: ISafeSource.chain, fetchedAt: new Date(now).toISOString(), stale: false },
      }

      SafeCacheModule.write(key, response, now, config.SAFE_API.INFO_CACHE_TTL, config.SAFE_API.INFO_STALE_WINDOW)
      recordUsage({
        network,
        kind: ISafeReadKind.info,
        cache: 'miss',
        upstreamCalls: 0,
        stale: false,
        freshMarked: false,
      })

      return response
    } catch (error) {
      if (!cached) throw error

      logger.info('Safe: chain read failed, serving stale info', llo({ network, address }))
      recordUsage({
        network,
        kind: ISafeReadKind.info,
        cache: 'stale',
        upstreamCalls: 0,
        stale: true,
        freshMarked: false,
      })

      return { ...cached.result, meta: { ...cached.result.meta, stale: true } }
    }
  },

  /**
   * The pending queue. Unexecuted transactions only, and deliberately **not** filtered by nonce: a
   * server-side `nonce__gte` would put the current nonce in the cache key, so every nonce advance
   * would orphan an entry. The client derives liveness from the nonce it already has.
   */
  async readQueue(
    network: NetworksEnum,
    rawAddress: string,
    limit: number,
    offset: number,
  ): Promise<ISafeQueueResponse> {
    assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()
    const key = SafeCacheModule.key(network, address, ISafeReadKind.queue, `${limit}:${offset}`)

    const cached = SafeCacheModule.read<ISafeQueueResponse>(key, now)
    const expired = SafeCacheModule.readExpired<ISafeQueueResponse>(key, now)
    if (cached?.fresh) {
      recordUsage({
        network,
        kind: ISafeReadKind.queue,
        cache: 'hit',
        upstreamCalls: 0,
        stale: false,
        freshMarked: false,
      })
      return cached.result
    }

    const pending = inFlight.get(key) as Promise<ISafeQueueResponse> | undefined
    const request =
      pending ??
      (async (): Promise<ISafeQueueResponse> => {
        const page = await fetchQueuePage(network, address, { executed: false, limit, offset })
        const response: ISafeQueueResponse = {
          ...page,
          meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
        }

        SafeCacheModule.write(key, response, now, config.SAFE_API.QUEUE_CACHE_TTL, config.SAFE_API.QUEUE_STALE_WINDOW)

        return response
      })()

    if (!pending) inFlight.set(key, request)

    try {
      const response = await request
      recordUsage({
        network,
        kind: ISafeReadKind.queue,
        cache: pending ? 'hit' : 'miss',
        upstreamCalls: pending ? 0 : 1,
        stale: false,
        freshMarked: false,
      })

      return response
    } catch (error) {
      // Fail open. Rate limited, unreachable, budget used up - if anything is still inside the stale
      // window, a flagged old queue beats a dead signing UI. Only a total absence of data fails.
      const stale = cached ?? expired
      if (!stale) throw error

      logger.info('Safe: queue read failed, serving stale queue', llo({ network, address }))
      recordUsage({
        network,
        kind: ISafeReadKind.queue,
        cache: 'stale',
        upstreamCalls: 1,
        stale: true,
        freshMarked: false,
      })

      return { ...stale.result, meta: { ...stale.result.meta, stale: true } }
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key)
    }
  },

  /**
   * The nonce a new transaction must occupy: one past the highest nonce anything queued already
   * holds, floored at the Safe's live onchain nonce.
   *
   * `max()` of the two is what keeps it correct in both directions. A stale queue would allocate a
   * nonce another transaction already holds; a stale onchain nonce with an empty queue would
   * allocate one the Safe has already spent. `executed=false` also matches transactions *below* the
   * current nonce - those are permanently dead and must never pull the answer backwards.
   *
   * Nothing here reads the cache, and nothing here writes it. There is also no `currentNonce`
   * parameter: given one, a caller would eventually pass a polled value.
   */
  async readNextNonce(network: NetworksEnum, rawAddress: string): Promise<ISafeNextNonceResponse> {
    assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()

    const currentNonce = await SafeChainReaderModule.readNonce(network, address)
    const queue = await fetchAllQueueTransactions(network, address, currentNonce)

    const highest = highestQueuedNonce(queue.transactions)
    const current = BigInt(currentNonce)
    const nextNonce = highest != null && highest + 1n > current ? highest + 1n : current

    recordUsage({
      network,
      kind: ISafeReadKind.nextNonce,
      cache: 'bypass',
      upstreamCalls: queue.pages,
      stale: false,
      freshMarked: true,
    })

    return {
      nextNonce: nextNonce.toString(),
      currentNonce,
      meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
    }
  },
}

export default SafeServiceModule
