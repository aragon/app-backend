/**
 * Safe body reads, served the cheapest correct way, and the store sync for tracked Safes.
 *
 * Runs in `aragon-gateway` and `aragon-dao`, the services holding both RPC providers and Mongo. The
 * API hands a read over RabbitMQ, so no upstream call and no chain read ever happens inside an HTTP
 * handler.
 *
 * Three reads, three different rules:
 *
 * - `info` (owners / threshold / version / onchain nonce / modules / guard) is chain state. It never
 *   touches the Safe API at all.
 * - `queue` and `history` genuinely need the Safe API: queued-but-unexecuted transactions exist
 *   offchain only. Shared Mongo cache, hourly counter, fail open on stale.
 * - `next-nonce` is never cached, on any code path. The nonce is bound into the EIP-712 `safeTxHash`
 *   and cannot be changed once signatures exist, so a stale input recreates the colliding-nonce bug
 *   this work exists to fix. Both of its inputs are read fresh, together, and it fails rather than
 *   answering from anything older.
 */

import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeCacheModule from '@modules/safe/safeCache'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { SafeReadError } from '@modules/safe/safeError'
import SafeProposalReportsModule from '@modules/safe/safeProposalReports'
import { lowestFreeNonce, parseQueuePage } from '@modules/safe/safeQueueParser'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import SafeTxServiceModule from '@modules/safeTxService'
import {
  getSafeShortName,
  type HexAddress,
  ISafeErrorCode,
  type ISafeHistoryFilters,
  type ISafeInfoResponse,
  type ISafeMultisigTransaction,
  type ISafeNextNonceResponse,
  type ISafePageRequest,
  type ISafeQueueResponse,
  ISafeReadKind,
  ISafeSource,
  type ISafeSyncAccount,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-service' })

/**
 * Joins reads that are in flight right now, in this process. The Mongo cache is what makes cost
 * scale with Safes instead of viewers across workers; this only stops one worker from firing the
 * same upstream call twice while the first is still open.
 */
const inFlight = new Map<string, Promise<unknown>>()

const SafeServiceModule = {
  /**
   * Chain state, cached in shared Mongo. On a chain-read failure an entry still inside the stale
   * window is served with `meta.stale`, because a slightly old threshold is worth far more to a
   * reader than an error page.
   */
  async readInfo(network: NetworksEnum, rawAddress: string): Promise<ISafeInfoResponse> {
    SafeServiceModule._assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(network, address, ISafeReadKind.info)
    const kind = ISafeReadKind.info

    const cached = await SafeCacheModule.read<ISafeInfoResponse>(key, now)
    if (cached?.fresh) {
      logger.info(
        'safe.usage',
        llo({ network, kind, cache: 'hit', upstreamCalls: 0, stale: false, freshMarked: false }),
      )
      return cached.result
    }

    try {
      const info = await SafeChainReaderModule.readInfo(network, address)
      const response: ISafeInfoResponse = {
        ...info,
        meta: { source: ISafeSource.chain, fetchedAt: new Date(now).toISOString(), stale: false },
      }

      await SafeCacheModule.write(key, response, now, config.SAFE_API.INFO_CACHE_TTL, config.SAFE_API.INFO_STALE_WINDOW)
      logger.info(
        'safe.usage',
        llo({ network, kind, cache: 'miss', upstreamCalls: 0, stale: false, freshMarked: false }),
      )

      return response
    } catch (error) {
      if (!cached) throw error

      logger.info('Safe: chain read failed, serving stale info', llo({ network, address }))
      logger.info(
        'safe.usage',
        llo({ network, kind, cache: 'stale', upstreamCalls: 0, stale: true, freshMarked: false }),
      )

      return { ...cached.result, meta: { ...cached.result.meta, stale: true } }
    }
  },

  /**
   * The pending queue. Unexecuted transactions only, and deliberately not filtered by nonce: a
   * server-side `nonce__gte` would put the current nonce in the cache key, so every nonce advance
   * would orphan an entry. The client derives liveness from the nonce it already has.
   *
   * Proposal correlation runs on the way out, not before the cache write: the cached page stays the
   * generic upstream contract, and a stale-served page is correlated just like a fresh one.
   */
  async readQueue(
    network: NetworksEnum,
    rawAddress: string,
    limit: number,
    offset: number,
  ): Promise<ISafeQueueResponse> {
    SafeServiceModule._assertSupported(network)

    const address = getAddress(rawAddress) as HexAddress
    const page = await SafeServiceModule._readCachedPage(
      SafeServiceModule._queueRequest(network, address, limit, offset),
    )

    return { ...page, results: await SafeProposalReportsModule.attach(network, address, page.results) }
  },

  /**
   * Executed transactions, highest nonce first. The queue serves unexecuted transactions only, so
   * everything about a transaction disappears from it the moment it executes - the confirmations it
   * collected, the nonce it consumed, and the onchain hash. This read is what makes a settled result
   * inspectable at all. No proposal correlation here: that stays the app's job.
   */
  async readHistory(
    network: NetworksEnum,
    rawAddress: string,
    filters: ISafeHistoryFilters,
  ): Promise<ISafeQueueResponse> {
    SafeServiceModule._assertSupported(network)

    const address = getAddress(rawAddress) as HexAddress

    return SafeServiceModule._readCachedPage(SafeServiceModule._historyRequest(network, address, filters))
  },

  /**
   * The nonce a new transaction must occupy: the lowest slot at or above the Safe's live onchain
   * nonce that nothing queued already holds. Holes are filled rather than skipped: a Safe executes
   * in strict nonce order, so a hole is the only way to expedite without displacing another
   * application's pending transaction.
   *
   * Nothing here reads the cache, and nothing here writes it. There is also no `currentNonce`
   * parameter: given one, a caller would eventually pass a polled value.
   */
  async readNextNonce(network: NetworksEnum, rawAddress: string): Promise<ISafeNextNonceResponse> {
    SafeServiceModule._assertSupported(network)

    const address = getAddress(rawAddress)
    const now = Date.now()

    const nonceBeforeScan = await SafeChainReaderModule.readNonce(network, address)
    const queue = await SafeServiceModule._scanQueue(network, address, nonceBeforeScan)

    // The scan pages through the budget gate and the limiter, so it can take seconds. If a queued
    // transaction executed in that window, the nonce it was floored at is already spent and an empty
    // remaining queue would hand back a dead nonce. Re-reading costs one RPC call, not Safe quota,
    // and floors the answer at whichever is higher. A window of one RPC round trip remains: only
    // `execTransaction` itself can settle the nonce atomically.
    const nonceAfterScan = await SafeChainReaderModule.readNonce(network, address)

    const current = BigInt(nonceAfterScan) > BigInt(nonceBeforeScan) ? BigInt(nonceAfterScan) : BigInt(nonceBeforeScan)
    const nextNonce = lowestFreeNonce(queue.transactions, current)

    logger.info(
      'safe.usage',
      llo({
        network,
        kind: ISafeReadKind.nextNonce,
        cache: 'bypass',
        upstreamCalls: queue.pages,
        stale: false,
        freshMarked: true,
      }),
    )

    return {
      nextNonce: nextNonce.toString(),
      currentNonce: current.toString(),
      meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
    }
  },

  /**
   * Pull a tracked Safe's queue and history into the store, through the same cache as the public
   * reads. One history page is a poll and its read errors are only logged; more pages is the one-shot
   * backfill sent on registration or execution, and its read errors throw for the bounded retry.
   */
  async syncStore(network: NetworksEnum, rawAddress: string, historyPages = 1): Promise<void> {
    if (!getSafeShortName(network)) return
    const address = getAddress(rawAddress) as HexAddress
    // Public reads never write. Only a Safe some DAO lists as a body or a process gets stored rows.
    if (!(await SafeBodyMembersModule.findDaosWithSafeBody([address], network)).length) return

    const pages = Math.min(Math.max(1, historyPages), config.SAFE_API.BACKFILL_HISTORY_PAGES)
    const fullDepth = pages > 1

    const row = await Models.SafeAccount.ensure(network, address)
    const account: ISafeSyncAccount = {
      id: Models.SafeAccount.buildId(network, address),
      queueFetchedAt: row?.queueFetchedAt?.getTime() ?? 0,
      historyFetchedAt: row?.historyFetchedAt?.getTime() ?? 0,
    }

    const removed = await SafeServiceModule._syncQueue(network, address, account, fullDepth)
    await SafeServiceModule._syncHistory(network, address, account, pages, removed > 0 || fullDepth)
  },

  _assertSupported(network: NetworksEnum) {
    if (getSafeShortName(network)) return

    // 501, never a 5xx: the app renders a dedicated state for it. `info` could technically be answered
    // from chain here, but a Safe body with no reachable queue cannot be signed from, so answering
    // half of it would only render a broken body.
    throw new SafeReadError(
      ISafeErrorCode.unsupportedChain,
      `${network} is not served by the Safe transaction service`,
      501,
    )
  },

  /**
   * One upstream queue page, budget-counted, validated against the wire contract. `reserveFor`
   * decides which share of the hourly bucket this call may spend - see `SafeCacheModule.consumeBudget`.
   */
  async _fetchPage(
    network: NetworksEnum,
    address: string,
    params: Record<string, unknown>,
    reserveFor: 'page' | 'nonce' = 'page',
  ) {
    const chargedAt = Date.now()
    if (!(await SafeCacheModule.consumeBudget(chargedAt, reserveFor))) {
      throw new SafeReadError(ISafeErrorCode.rateLimited, 'Safe read budget for this hour is used up', 429, 300, false)
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
  },

  /**
   * Every live queue transaction at or above the current nonce, for next-nonce. Pages by a
   * descending nonce bound, not an offset: the queue is mutable, so a deletion between pages shifts
   * every offset and can slide a still-queued nonce out of the scan window. An unsorted full page is
   * rejected before its bound is used. Never cached: `nonce__gte` would otherwise poison a cache key.
   */
  async _scanQueue(
    network: NetworksEnum,
    address: string,
    currentNonce: string,
  ): Promise<{ transactions: ISafeMultisigTransaction[]; pages: number }> {
    // A full page needs two rows for the descending-order check below to mean anything.
    const limit = Math.max(2, config.SAFE_API.NEXT_NONCE_SCAN_LIMIT)
    const floor = BigInt(currentNonce)
    const transactions: ISafeMultisigTransaction[] = []
    let upperBound: bigint | undefined
    let pages = 0

    while (true) {
      const page = await SafeServiceModule._fetchPage(
        network,
        address,
        {
          executed: false,
          nonce__gte: currentNonce,
          ...(upperBound == null ? {} : { nonce__lte: upperBound.toString() }),
          ordering: '-nonce',
          limit,
        },
        // Spends the reserved tail of the budget: this read has no stale fallback, and a refusal here
        // means no Safe transaction can be allocated a nonce at all.
        'nonce',
      )
      transactions.push(...page.results)
      pages += 1

      // A short page is the last one. A full page may hold more below it, so drop the bound just under
      // the lowest nonce this page carried and scan the next window.
      if (page.results.length < limit) return { transactions, pages }

      let lowest = BigInt(page.results[0].nonce)
      for (let index = 1; index < page.results.length; index += 1) {
        const nonce = BigInt(page.results[index].nonce)
        if (nonce > lowest) {
          throw new SafeReadError(
            ISafeErrorCode.invalidResponse,
            'Safe queue page was not ordered by descending nonce',
            502,
          )
        }
        lowest = nonce
      }
      upperBound = lowest - 1n

      if (upperBound < floor) return { transactions, pages }
    }
  },

  /**
   * One paginated Safe API page, cached in shared Mongo. The queue and the history differ only in
   * which transactions they ask for and how long the answer stays good; the cache read, the
   * in-process coalesce, the budget gate and the fail-open-on-stale rule are identical.
   */
  async _readCachedPage(request: ISafePageRequest): Promise<ISafeQueueResponse> {
    const { network, address, kind, keySuffix, params, cacheTtl, staleWindow, bypassCache } = request
    const now = Date.now()
    const key = Models.SafeCache.cacheKey(network, address, kind, keySuffix)

    const cached = bypassCache ? null : await SafeCacheModule.read<ISafeQueueResponse>(key, now)
    if (cached?.fresh) {
      logger.info(
        'safe.usage',
        llo({ network, kind, cache: 'hit', upstreamCalls: 0, stale: false, freshMarked: false }),
      )

      return cached.result
    }

    const expired = cached ? null : await SafeCacheModule.readExpired<ISafeQueueResponse>(key, now)
    const pending = inFlight.get(key) as Promise<ISafeQueueResponse> | undefined
    const read =
      pending ??
      (async (): Promise<ISafeQueueResponse> => {
        const page = await SafeServiceModule._fetchPage(network, address, params)
        const response: ISafeQueueResponse = {
          ...page,
          meta: { source: ISafeSource.safeApi, fetchedAt: new Date(now).toISOString(), stale: false },
        }

        await SafeCacheModule.write(key, response, now, cacheTtl, staleWindow)

        return response
      })()

    if (!pending) inFlight.set(key, read)

    try {
      const response = await read
      logger.info(
        'safe.usage',
        llo({
          network,
          kind,
          cache: pending ? 'hit' : 'miss',
          upstreamCalls: pending ? 0 : 1,
          stale: false,
          freshMarked: false,
        }),
      )

      return response
    } catch (error) {
      // Fail open. Rate limited, unreachable, budget used up - if anything is still inside the stale
      // window, a flagged old page beats a dead signing UI. Only a total absence of data fails.
      const stale = cached ?? expired
      if (!stale) throw error

      logger.info('Safe: page read failed, serving stale', llo({ network, address, kind }))
      logger.info(
        'safe.usage',
        llo({
          network,
          kind,
          cache: 'stale',
          upstreamCalls: pending || (SafeReadError.isSafeReadError(error) && !error.reachedUpstream) ? 0 : 1,
          stale: true,
          freshMarked: false,
        }),
      )

      return { ...stale.result, meta: { ...stale.result.meta, stale: true } }
    } finally {
      // Identity check: a newer request for the same key must not be deleted by an older one finishing.
      if (inFlight.get(key) === read) inFlight.delete(key)
    }
  },

  /** Queue and history page requests, shared by the public reads and the sync so both hit one cache. */
  _queueRequest(network: NetworksEnum, address: string, limit: number, offset: number): ISafePageRequest {
    return {
      network,
      address,
      kind: ISafeReadKind.queue,
      keySuffix: Models.SafeCache.queuePage(limit, offset),
      params: { executed: false, limit, offset },
      cacheTtl: config.SAFE_API.QUEUE_CACHE_TTL,
      staleWindow: config.SAFE_API.QUEUE_STALE_WINDOW,
    }
  },

  _historyRequest(network: NetworksEnum, address: string, filters: ISafeHistoryFilters): ISafePageRequest {
    const { limit, offset, to, nonceGte, nonceLte } = filters

    return {
      network,
      address,
      kind: ISafeReadKind.history,
      keySuffix: Models.SafeCache.historyPage({ limit, offset, to, nonceGte, nonceLte }),
      params: {
        executed: true,
        limit,
        offset,
        // Safe ignores an ordering it does not know, so nothing may rely on this order.
        ordering: '-nonce',
        ...(to == null ? {} : { to }),
        ...(nonceGte == null ? {} : { nonce__gte: nonceGte }),
        ...(nonceLte == null ? {} : { nonce__lte: nonceLte }),
      },
      cacheTtl: config.SAFE_API.HISTORY_CACHE_TTL,
      staleWindow: config.SAFE_API.HISTORY_STALE_WINDOW,
    }
  },

  /** A page is worth writing when it came from upstream and is newer than what the store already holds. */
  _isNewer(page: ISafeQueueResponse, storedAt: number): boolean {
    return !page.meta.stale && Date.parse(page.meta.fetchedAt) > storedAt
  },

  /**
   * The first queue page into the store. Returns how many stored rows the page proved gone, so the
   * history read can skip its cache. Only a complete page can prove a row absent.
   */
  async _syncQueue(
    network: NetworksEnum,
    address: HexAddress,
    account: ISafeSyncAccount,
    fullDepth: boolean,
  ): Promise<number> {
    const limit = config.SAFE_API.BACKFILL_PAGE_SIZE
    let queue: ISafeQueueResponse
    try {
      queue = await SafeServiceModule._readCachedPage(SafeServiceModule._queueRequest(network, address, limit, 0))
    } catch (error) {
      if (fullDepth) throw error
      logger.warn('Safe sync could not read the queue', llo({ network, address, error }))
      return 0
    }
    if (!SafeServiceModule._isNewer(queue, account.queueFetchedAt)) return 0

    const fetchedAt = Date.parse(queue.meta.fetchedAt)
    const complete = queue.next == null && queue.count === queue.results.length
    const seen = queue.results.map(row => row.safeTxHash)
    // Reconcile, then record, then stamp: a stamp must only ever advertise rows already written.
    const removed = await SafeTransactionsModule.reconcileQueue(network, address, seen, fetchedAt, complete)
    await SafeTransactionsModule.record(network, address, queue.results, fetchedAt)
    await Models.SafeAccount.stamp(account.id, 'queueFetchedAt', fetchedAt, { queueComplete: complete })

    return removed
  },

  /**
   * History pages into the store, newest first. Page zero skips the cache when the queue step
   * removed rows or this is a backfill, so a row that just executed is seen as executed at once.
   */
  async _syncHistory(
    network: NetworksEnum,
    address: HexAddress,
    account: ISafeSyncAccount,
    pages: number,
    bypassFirstPage: boolean,
  ): Promise<void> {
    const limit = config.SAFE_API.BACKFILL_PAGE_SIZE
    const fullDepth = pages > 1

    for (let page = 0; page < pages; page += 1) {
      let history: ISafeQueueResponse
      try {
        history = await SafeServiceModule._readCachedPage({
          ...SafeServiceModule._historyRequest(network, address, { limit, offset: page * limit }),
          bypassCache: page === 0 && bypassFirstPage,
        })
      } catch (error) {
        if (fullDepth) throw error
        logger.warn('Safe sync stopped reading history', llo({ network, address, page, error }))
        return
      }

      const fetchedAt = Date.parse(history.meta.fetchedAt)
      if (!history.meta.stale && (page > 0 || fetchedAt > account.historyFetchedAt)) {
        await SafeTransactionsModule.record(network, address, history.results, fetchedAt)
        if (page === 0) await Models.SafeAccount.stamp(account.id, 'historyFetchedAt', fetchedAt)
      }
      if (!history.next) return
    }
  },
}

export default SafeServiceModule
