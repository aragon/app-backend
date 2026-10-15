/**
 * Safe body controller.
 *
 * Holds no logic beyond the hand-off: the reads need RPC providers and Mongo writes, and the API has
 * only the latter, so the work happens in `aragon-gateway` next to the cache and the hourly counter
 * that protect the shared Safe API key. This is the same pattern `contractInfo` and
 * `canCreateProposal` already use.
 */

import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeProposalReportsModule from '@modules/safe/safeProposalReports'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type IQueueSafeRead,
  type ISafeInfoResponse,
  type ISafeNextNonceResponse,
  type ISafeQueueResponse,
  ISafeReadKind,
  ISafeTransactionState,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'controller:Safe' })

const SafeController = {
  async getInfo(network: IQueueSafeRead['network'], address: string): Promise<ISafeInfoResponse> {
    return (await SafeReadRequestModule.send({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.info,
    })) as ISafeInfoResponse
  },

  async getQueue(
    network: IQueueSafeRead['network'],
    address: string,
    limit: number,
    offset: number,
  ): Promise<ISafeQueueResponse> {
    return (await SafeReadRequestModule.send({
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
    return (await SafeReadRequestModule.send({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.history,
      ...filters,
    })) as ISafeQueueResponse
  },

  /**
   * A tracked Safe is answered from the store, and every request queues a background pull of the
   * first queue page in aragon-dao, so the next request has what the Safe service holds now. The
   * pull is cached for ten seconds and budget-gated, so polling costs one upstream call per ten
   * seconds at most. `stale` says the store has not been pulled inside the queue window. An
   * untracked Safe is 404 before any read; `/queue` and `/history` still serve it live.
   */
  async getTransactions(
    network: IQueueSafeRead['network'],
    address: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    await SafeBodyMembersModule.assertTracked(address, network)

    RabbitMQHelper.sendMessage(EnumQueueName.safeRefresh, {
      id: `safe-refresh-${network}-${address}`,
      params: { network, address },
    }).catch(error => {
      logger.warn('Unable to queue the Safe pull', llo({ network, address, error }))
    })

    const stored = await SafeTransactionsModule.list(network, address, filters)
    const meta = await SafeTransactionsModule.freshness(network, address)
    const results = await SafeProposalReportsModule.attach(network, address, stored.results)

    return { ...stored, results, meta }
  },

  /**
   * The readable actions of one stored transaction, in the shape `/proposals/:id/actions` answers.
   * Stored rows only: an untracked Safe is 404 before any read.
   */
  async getTransactionActions(network: IQueueSafeRead['network'], address: HexAddress, safeTxHash: string) {
    await SafeBodyMembersModule.assertTracked(address, network)

    const row = await Models.SafeTransaction.findOne(
      { network, safeAddress: address, safeTxHash },
      { actions: 1, rawActions: 1, decoding: 1 },
    ).lean()
    assertExposable(row, ErrorKeyEnum.notFound, 404)

    return { decoding: row.decoding ?? true, actions: row.actions ?? [], rawActions: row.rawActions ?? [] }
  },

  async getNextNonce(network: IQueueSafeRead['network'], address: string): Promise<ISafeNextNonceResponse> {
    return (await SafeReadRequestModule.send({
      sentAt: Date.now(),
      network,
      address,
      kind: ISafeReadKind.nextNonce,
    })) as ISafeNextNonceResponse
  },
}

export default SafeController
