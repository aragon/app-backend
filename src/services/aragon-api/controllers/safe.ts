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
   * A Safe's transactions, however we can get them.
   *
   * A Safe we track is answered from what we hold: no RabbitMQ, no shared key, no budget, and it
   * carries executed and pending in one list. A Safe we do not track has nothing stored and never
   * will, so it is read live through the gateway instead of handing back an empty page that means
   * four different things.
   *
   * The caller asks the same question either way and `meta.source` says which answer it got, so a
   * workspace passing arbitrary addresses needs to know nothing about what we track.
   */
  async getTransactions(
    network: IQueueSafeRead['network'],
    address: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    if (await SafeTrackingModule.isTracked(network, address)) {
      const stored = await SafeTransactionsModule.list(network, address, filters)

      return { ...stored, meta: { source: ISafeSource.store, stale: false } }
    }

    return await SafeController._readTransactionsLive(network, address, filters)
  },

  /**
   * The readable actions of one stored transaction, in the shape `/proposals/:id/actions` answers.
   *
   * Stored rows only. A Safe we do not track has no row to decode and no decode is run for it, so
   * the honest answer is that we hold nothing for this hash rather than a live read that would come
   * back undecoded anyway.
   */
  async getTransactionActions(network: IQueueSafeRead['network'], address: HexAddress, safeTxHash: string) {
    const row = await Models.SafeTransaction.findOne(
      { network, safeAddress: address, safeTxHash },
      { actions: 1, rawActions: 1, decoding: 1 },
    ).lean()
    assertExposable(row, ErrorKeyEnum.notFound)

    return { decoding: row.decoding, actions: row.actions ?? [], rawActions: row.rawActions ?? [] }
  },

  /**
   * The live answer, for a Safe we hold nothing for.
   *
   * Two reads at most, and only the ones the filter asks for - the queue holds what is pending, the
   * history holds what executed, and neither holds the other. Both go through the cache, the limiter
   * and the budget exactly as a direct call to those routes would.
   */
  async _readTransactionsLive(
    network: IQueueSafeRead['network'],
    address: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    const { limit, offset, state, to } = filters
    const wantsPending = state == null || state === ISafeTransactionState.live
    const wantsExecuted = state == null || state === ISafeTransactionState.executed

    const [pending, executed] = await Promise.all([
      wantsPending ? SafeController.getQueue(network, address, limit, offset) : null,
      wantsExecuted ? SafeController.getHistory(network, address, { limit, offset }) : null,
    ])

    // `to` is applied here, never upstream: the service only sees the envelope, whose `to` is the
    // MultiSend contract for every batched transaction.
    const results = [...(pending?.results ?? []), ...(executed?.results ?? [])].filter(
      transaction => to == null || SafeTransactionsModule.targetsFor(transaction).includes(to),
    )

    return {
      count: results.length,
      // Paging two upstream lists as one is not something either of them can answer, so it is not
      // claimed. A caller needing to page a Safe we do not track reads the queue or the history.
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
