/**
 * Safe body controller.
 *
 * Holds no logic beyond the hand-off: the reads need RPC providers and Mongo writes, and the API has
 * only the latter, so the work happens in `aragon-gateway` next to the cache and the hourly counter
 * that protect the shared Safe API key. This is the same pattern `contractInfo` and
 * `canCreateProposal` already use.
 */

import config from '@config'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { SafeReadError } from '@modules/safe/safeError'
import SafeTrackingModule from '@modules/safe/safeTracking'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import {
  EnumQueueName,
  ErrorKeyEnum,
  getSafeShortName,
  type HexAddress,
  type IQueueSafeRead,
  ISafeErrorCode,
  type ISafeInfoResponse,
  type ISafeNextNonceResponse,
  type ISafeQueueResponse,
  ISafeReadKind,
  ISafeSource,
  ISafeTransactionState,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'controller:Safe' })

async function read(params: IQueueSafeRead): Promise<unknown> {
  const { network, address, kind, limit, offset } = params

  // Reject before RabbitMQ for chains with no Safe Transaction Service. This is a first-class
  // answer, not a gateway outage, and avoids spending the request timeout on a queue that cannot
  // answer it.
  if (!getSafeShortName(network)) {
    throw new SafeReadError(
      ISafeErrorCode.unsupportedChain,
      `${network} is not served by the Safe transaction service`,
      501,
    )
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
  if (result == null) {
    throw new SafeReadError(ISafeErrorCode.connectionError, 'The Safe read did not complete in time', 502)
  }

  // A reply always arrives as an object, so `safeError` - not the reply itself - marks the failure.
  if (typeof result === 'object' && 'safeError' in result) {
    throw SafeReadError.fromQueueError(result)
  }

  return result
}

const SafeController = {
  async getInfo(network: IQueueSafeRead['network'], address: string): Promise<ISafeInfoResponse> {
    return (await read({ sentAt: Date.now(), network, address, kind: ISafeReadKind.info })) as ISafeInfoResponse
  },

  async getQueue(
    network: IQueueSafeRead['network'],
    address: string,
    limit: number,
    offset: number,
  ): Promise<ISafeQueueResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.queue,
      limit,
      offset,
    })) as ISafeQueueResponse
  },

  async getHistory(
    network: IQueueSafeRead['network'],
    address: string,
    filters: { limit: number; offset: number; to?: string; nonceGte?: string; nonceLte?: string },
  ): Promise<ISafeQueueResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.history,
      ...filters,
    })) as ISafeQueueResponse
  },

  /**
   * A tracked Safe is answered from the store, a bounded recent window of pending and executed; an
   * untracked one is read live through the gateway. A stale store answer queues a refresh for the
   * next caller and is not awaited. `meta.source` says which answer it got.
   *
   * A page with a live row is stale past the queue window. A page with only executed rows is only
   * re-read on the history cadence, so it is judged against the history cache TTL.
   */
  async getTransactions(
    network: IQueueSafeRead['network'],
    address: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    if (await SafeTrackingModule.isTracked(network, address)) {
      const stored = await SafeTransactionsModule.list(network, address, filters)
      const hasLive = stored.results.some(row => row.state === ISafeTransactionState.live)
      const window = hasLive ? config.SAFE_API.QUEUE_STALE_WINDOW : config.SAFE_API.HISTORY_CACHE_TTL
      const stale = stored.refreshedAt == null || Date.now() - Date.parse(stored.refreshedAt) > window

      if (stale) {
        RabbitMQHelper.sendMessage(EnumQueueName.safeRefresh, {
          id: `safe-refresh-${network}-${address}`,
          params: { network, address },
        }).catch(error => {
          logger.warn('Unable to enqueue the Safe store refresh', llo({ network, address, error }))
        })
      }

      return { ...stored, meta: { source: ISafeSource.store, stale } }
    }

    return await SafeController._readTransactionsLive(network, address, filters)
  },

  /**
   * The readable actions of one stored transaction, in the shape `/proposals/:id/actions` answers.
   * Stored rows only: an untracked Safe is never decoded.
   */
  async getTransactionActions(network: IQueueSafeRead['network'], address: HexAddress, safeTxHash: string) {
    const row = await Models.SafeTransaction.findOne(
      { network, safeAddress: address, safeTxHash: safeTxHash.toLowerCase() },
      { actions: 1, rawActions: 1, decoding: 1, decodeFailed: 1 },
    ).lean()
    assertExposable(row, ErrorKeyEnum.notFound)

    return {
      decoding: row.decoding,
      decodeFailed: row.decodeFailed ?? false,
      actions: row.actions ?? [],
      rawActions: row.rawActions ?? [],
    }
  },

  /**
   * The live answer for an untracked Safe: the queue for pending, the history for executed, both
   * through the cache, limiter and budget. A single `state` is one upstream list, paged as asked.
   * Without one, neither list knows the other, so both are read from zero up to `offset + limit`,
   * capped at the largest page the route accepts, and the merged page is cut here. `count` is the
   * page length, two upstream lists have no shared total.
   */
  async _readTransactionsLive(
    network: IQueueSafeRead['network'],
    address: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    const { limit, offset, state, to } = filters
    const wantsPending = state == null || state === ISafeTransactionState.live
    const wantsExecuted = state == null || state === ISafeTransactionState.executed
    const merged = wantsPending && wantsExecuted
    const page = merged
      ? { limit: Math.min(offset + limit, config.SAFE_API.MAX_PAGE_SIZE), offset: 0 }
      : { limit, offset }

    const [pending, executed] = await Promise.all([
      wantsPending ? SafeController.getQueue(network, address, page.limit, page.offset) : null,
      wantsExecuted ? SafeController.getHistory(network, address, page) : null,
    ])

    // `to` is applied here, never upstream: the service only sees the envelope, whose `to` is the
    // MultiSend contract for every batched transaction.
    const results = [...(pending?.results ?? []), ...(executed?.results ?? [])]
      .filter(transaction => to == null || SafeTransactionsModule.targetsFor(transaction).includes(to))
      // A missing or malformed date sorts last rather than making the comparator return NaN.
      .sort((a, b) => (Date.parse(b.submissionDate ?? '') || 0) - (Date.parse(a.submissionDate ?? '') || 0))
      .slice(merged ? offset : 0, (merged ? offset : 0) + limit)

    return {
      count: results.length,
      // Two upstream lists cannot be paged as one; a caller pages the queue or the history.
      next: null,
      previous: null,
      results,
      refreshedAt: null,
      meta: {
        source: ISafeSource.safeApi,
        stale: !!pending?.meta.stale || !!executed?.meta.stale,
      },
    }
  },

  async getNextNonce(network: IQueueSafeRead['network'], address: string): Promise<ISafeNextNonceResponse> {
    return (await read({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.nextNonce,
    })) as ISafeNextNonceResponse
  },
}

export default SafeController
