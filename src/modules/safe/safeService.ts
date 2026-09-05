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
 *   exist offchain only. Shared Mongo cache, hourly counter, fail open on stale.
 * - `next-nonce` is never cached, on any code path. The nonce is bound into the EIP-712 `safeTxHash`
 *   and cannot be changed once signatures exist, so a stale input recreates the colliding-nonce bug
 *   this work exists to fix. Both of its inputs are read fresh, together, and it fails rather than
 *   answering from anything older.
 */

import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeCacheModule from '@modules/safe/safeCache'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { SafeReadError } from '@modules/safe/safeError'
import { lowestFreeNonce, parseQueuePage } from '@modules/safe/safeQueueParser'
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
 * Joins reads that are in flight *right now, in this process*. The Mongo cache is what makes cost
 * scale with Safes instead of viewers across workers; this only stops one worker from firing the
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

/**
 * One upstream queue page, budget-counted, validated against the wire contract.
 *
 * `reserveFor` decides which share of the hourly bucket this call may spend - see
 * `SafeCacheModule.consumeBudget`. A unit is refunded when the limiter drops the job instead of
 * making the call, so the counter tracks calls actually made rather than calls attempted.
 */
async function fetchQueuePage(
  network: NetworksEnum,
  address: string,
  params: Record<string, unknown>,
  reserveFor: 'page' | 'nonce' = 'page',
) {
  const chargedAt = Date.now()
  if (!(await SafeCacheModule.consumeBudget(chargedAt, reserveFor))) {
    throw new SafeReadError(ISafeErrorCode.rateLimited, 'Safe read budget for this hour is used up', 429, 300)
  }

  let response: unknown
  try {
    response = await SafeTxServiceModule.get(network, `/v2/safes/${address}/multisig-transactions/`, params)
  } catch (error) {
    // Refund only a local refusal. The limiter drops jobs past its high water mark without calling
    // upstream, so that unit was never spent; a genuine upstream 429 carries the same code and
    // status but did consume quota, and refunding it would undercount real calls.
    if (SafeReadError.isSafeReadError(error) && !error.reachedUpstream) {
      await SafeCacheModule.refundBudget(chargedAt)
    }

    throw error
  }

  const page = parseQueuePage(response)

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
    const page = await fetchQueuePage(
      network,
      address,
      { executed: false, nonce__gte: currentNonce, limit, offset },
      // Spends the reserved tail of the budget: this read has no stale fallback, and a refusal here
      // means no Safe transaction can be allocated a nonce at all.
      'nonce',
    )
    transactions.push(...page.results)
    pages += 1

    if (page.results.length === 0 || transactions.length >= page.count) return { transactions, pages }

    offset += page.results.length
  }
}

/**
 * One paginated Safe-API page, cached in shared Mongo.
 *
 * The queue and the history differ only in which transactions they ask for and how long the answer
 * stays good; the cache read, the in-process coalesce, the budget gate and the fail-open-on-stale
 * rule are identical, so they live here once.
 */
async function readCachedPage(args: {
  network: NetworksEnum
  address: string
  kind: ISafeReadKind
  keySuffix: string
  params: Record<string, unknown>
  cacheTtl: number
  staleWindow: number
}): Promise<ISafeQueueResponse> {
  const { network, address, kind, keySuffix, params, cacheTtl, staleWindow } = args
  const now = Date.now()
  const key = Models.SafeCache.cacheKey(network, address, kind, keySuffix)

  const cached = await SafeCacheModule.read<ISafeQueueResponse>(key, now)
  if (cached?.fresh) {
    recordUsage({ network, kind, cache: 'hit', upstreamCalls: 0, stale: false, freshMarked: false })

    return cached.result
  }

  const expired = cached ? null : await SafeCacheModule.readExpired<ISafeQueueResponse>(key, now)
  const pending = inFlight.get(key) as Promise<ISafeQueueResponse> | undefined
  const request =
    pending ??
    (async (): Promise<ISafeQueueResponse> => {
      const page = await fetchQueuePage(network, address, params)
      const response: ISafeQueueResponse = {
        ...page,
        meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
      }

      await SafeCacheModule.write(key, response, now, cacheTtl, staleWindow)

      return response
    })()

  if (!pending) inFlight.set(key, request)

  try {
    const response = await request
    recordUsage({
      network,
      kind,
      cache: pending ? 'hit' : 'miss',
      upstreamCalls: pending ? 0 : 1,
      stale: false,
      freshMarked: false,
    })

    return response
  } catch (error) {
    // Fail open. Rate limited, unreachable, budget used up - if anything is still inside the stale
    // window, a flagged old page beats a dead signing UI. Only a total absence of data fails.
    const stale = cached ?? expired
    if (!stale) throw error

    logger.info('Safe: page read failed, serving stale', llo({ network, address, kind }))
    recordUsage({
      network,
      kind,
      cache: 'stale',
      upstreamCalls: pending ? 0 : 1,
      stale: true,
      freshMarked: false,
    })

    return { ...stale.result, meta: { ...stale.result.meta, stale: true } }
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key)
  }
}

const SafeServiceModule = {
  /**
   * Chain state, cached in shared Mongo. On a chain-read failure an entry still inside the stale window is
   * served with `meta.stale`, because a slightly old threshold is worth far more to a reader than an
   * error page.
   */
  async readInfo(network: NetworksEnum, rawAddress: string): Promise<ISafeInfoResponse> {
    assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(network, address, ISafeReadKind.info)

    const cached = await SafeCacheModule.read<ISafeInfoResponse>(key, now)
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

      await SafeCacheModule.write(key, response, now, config.SAFE_API.INFO_CACHE_TTL, config.SAFE_API.INFO_STALE_WINDOW)
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

    return readCachedPage({
      network,
      address: getAddress(rawAddress),
      kind: ISafeReadKind.queue,
      keySuffix: `${limit}:${offset}`,
      params: { executed: false, limit, offset },
      cacheTtl: config.SAFE_API.QUEUE_CACHE_TTL,
      staleWindow: config.SAFE_API.QUEUE_STALE_WINDOW,
    })
  },

  /**
   * Executed transactions, highest nonce first.
   *
   * The queue serves unexecuted transactions only, so everything about a transaction disappears from
   * it the moment it executes - the confirmations it collected, the nonce it consumed, and the
   * onchain hash. This read is what makes a settled result inspectable at all.
   *
   * Deliberately generic: no proposal correlation, no MultiSend unwrapping, no SPP knowledge.
   * Correlation moves faster than a backend release and stays the app's job.
   */
  async readHistory(
    network: NetworksEnum,
    rawAddress: string,
    filters: { limit: number; offset: number; to?: string; nonceGte?: string; nonceLte?: string },
  ): Promise<ISafeQueueResponse> {
    assertSupported(network)

    const { limit, offset, to, nonceGte, nonceLte } = filters

    return readCachedPage({
      network,
      address: getAddress(rawAddress),
      kind: ISafeReadKind.history,
      // Every filter is in the key: two different windows are two different answers, and collapsing
      // them would serve one caller's narrowed page to another.
      keySuffix: `${limit}:${offset}:${to ?? ''}:${nonceGte ?? ''}:${nonceLte ?? ''}`,
      params: {
        executed: true,
        limit,
        offset,
        // Verified honoured against the live service (sepolia returned nonces 6,5,4,3,2 descending),
        // but the service answers 200 and silently ignores an `ordering` it does not recognise, so a
        // future rename degrades to upstream's default order rather than an error. The app must sort
        // if it depends on order.
        ordering: '-nonce',
        ...(to == null ? {} : { to }),
        ...(nonceGte == null ? {} : { nonce__gte: nonceGte }),
        ...(nonceLte == null ? {} : { nonce__lte: nonceLte }),
      },
      cacheTtl: config.SAFE_API.HISTORY_CACHE_TTL,
      staleWindow: config.SAFE_API.HISTORY_STALE_WINDOW,
    })
  },

  /**
   * The nonce a new transaction must occupy: the lowest slot at or above the Safe's live onchain
   * nonce that nothing queued already holds.
   *
   * Holes are filled rather than skipped. A Safe executes in strict nonce order, so a hole is the
   * only way to expedite without displacing another application's pending transaction. A gapless
   * queue still yields the tail, and an empty one yields the current nonce.
   *
   * Nothing here reads the cache, and nothing here writes it. There is also no `currentNonce`
   * parameter: given one, a caller would eventually pass a polled value.
   */
  async readNextNonce(network: NetworksEnum, rawAddress: string): Promise<ISafeNextNonceResponse> {
    assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()

    const nonceBeforeScan = await SafeChainReaderModule.readNonce(network, address)
    const queue = await fetchAllQueueTransactions(network, address, nonceBeforeScan)

    // The scan pages through the budget gate and the limiter, so it can take seconds. If a queued
    // transaction executed in that window, the nonce it was floored at is already spent and an empty
    // remaining queue would hand back a dead nonce - the exact failure this read exists to avoid.
    // Re-reading costs one RPC call, not Safe quota, and floors the answer at whichever is higher.
    //
    // A window of one RPC round trip remains after this read. Closing it entirely is not possible
    // off-chain: only `execTransaction` itself can settle the nonce atomically.
    const nonceAfterScan = await SafeChainReaderModule.readNonce(network, address)

    const current = BigInt(nonceAfterScan) > BigInt(nonceBeforeScan) ? BigInt(nonceAfterScan) : BigInt(nonceBeforeScan)
    const nextNonce = lowestFreeNonce(queue.transactions, current)

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
      currentNonce: current.toString(),
      meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
    }
  },
}

export default SafeServiceModule
