/**
 * Keeps `SafeTransaction` rows in step with the Safe service, written from the pages the gateway
 * already fetches. A row leaves `live` when an execution event or history page names the winner at
 * its nonce, or when the Safe's onchain nonce has passed it.
 */

import { Models } from '@dbModels'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import MultiSendModule from '@modules/safe/multiSend'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import {
  EnumQueueName,
  type HexAddress,
  type IRawAction,
  type ISafeMultisigTransaction,
  ISafeTransactionState,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeTransactions' })

/** `ISafeMultisigTransaction` fields plus `state`. */
const WIRE_FIELDS = [
  '-_id',
  'safeTxHash',
  'nonce',
  'state',
  'from',
  'to',
  'value',
  'data',
  'operation',
  'safeTxGas',
  'baseGas',
  'gasPrice',
  'gasToken',
  'refundReceiver',
  'confirmations',
  'confirmationsRequired',
  'isSuccessful',
  'submissionDate',
  'executionDate',
  'transactionHash',
].join(' ')

const SafeTransactionsModule = {
  _private: {
    /** A Safe transaction as the raw actions it performs. Split only; `DecodeActions` decodes off the refresh path. */
    rawActionsOf(transaction: ISafeMultisigTransaction): IRawAction[] {
      const envelope: IRawAction = {
        to: transaction.to,
        value: transaction.value ?? '0',
        data: transaction.data ?? '0x',
      }

      if (envelope.data.slice(0, 10).toLowerCase() !== MultiSendModule.SELECTOR) return [envelope]

      const { calls, malformed } = MultiSendModule.split(envelope.data)
      if (malformed) {
        logger.warn('Unable to split a MultiSend transaction', llo({ safeTxHash: transaction.safeTxHash }))

        return [envelope]
      }

      return calls.length ? calls : [envelope]
    },
  },

  /**
   * Write one page of the queue or the history. Confirmations and state are refreshed on every pass,
   * and an executed row settles the rivals at its nonce.
   */
  async upsert(
    network: NetworksEnum,
    safeAddress: HexAddress,
    transactions: ISafeMultisigTransaction[],
    now: number,
  ): Promise<number> {
    if (!transactions.length) return 0

    const refreshedAt = new Date(now)
    const operations = transactions.map(transaction => {
      const rawActions = SafeTransactionsModule._private.rawActionsOf(transaction)

      return {
        updateOne: {
          filter: { network, safeAddress, safeTxHash: transaction.safeTxHash },
          update: {
            $set: {
              nonce: transaction.nonce,
              to: transaction.to,
              rawActions,
              targets: [...new Set(rawActions.map(action => action.to))] as HexAddress[],
              value: transaction.value,
              data: transaction.data,
              operation: transaction.operation,
              safeTxGas: transaction.safeTxGas,
              baseGas: transaction.baseGas,
              gasPrice: transaction.gasPrice,
              gasToken: transaction.gasToken,
              refundReceiver: transaction.refundReceiver,
              from: transaction.from,
              confirmations: transaction.confirmations,
              confirmationsRequired: transaction.confirmationsRequired,
              submissionDate: transaction.submissionDate,
              refreshedAt,
              ...(transaction.executionDate ? { executionDate: transaction.executionDate } : {}),
              ...(transaction.transactionHash ? { transactionHash: transaction.transactionHash } : {}),
              ...(transaction.isSuccessful == null ? {} : { isSuccessful: transaction.isSuccessful }),
              ...(transaction.isExecuted ? { state: ISafeTransactionState.executed } : {}),
            },
            $setOnInsert: {
              id: Models.SafeTransaction.buildId(network, safeAddress, transaction.safeTxHash),
              network,
              safeAddress,
              safeTxHash: transaction.safeTxHash,
              decoding: true,
              ...(transaction.isExecuted ? {} : { state: ISafeTransactionState.live }),
            },
          },
          upsert: true,
        },
      }
    })

    const result = await Models.SafeTransaction.bulkWrite(operations, { ordered: false })

    // A history page names the winner at each nonce, so it settles the rivals like the execution event.
    const winners = transactions.filter(transaction => transaction.isExecuted)
    if (winners.length) {
      await Models.SafeTransaction.bulkWrite(
        winners.map(winner => ({
          updateMany: {
            filter: {
              network,
              safeAddress,
              nonce: winner.nonce,
              state: ISafeTransactionState.live,
              safeTxHash: { $ne: winner.safeTxHash },
            },
            update: { $set: { state: ISafeTransactionState.superseded } },
          },
        })),
        { ordered: false },
      )
    }

    return result.upsertedCount + result.modifiedCount
  },

  /**
   * Queue one decode job per row on this page that still owes one, the way a proposal's actions are
   * decoded. A row written before `decoding` existed owes one too.
   */
  async queueDecodes(network: NetworksEnum, safeAddress: HexAddress, safeTxHashes: string[]): Promise<void> {
    const rows = await Models.SafeTransaction.find({
      network,
      safeAddress,
      safeTxHash: { $in: safeTxHashes },
      decoding: { $ne: false },
    })
      .select('id')
      .lean()

    for (const row of rows) {
      await RabbitMQHelper.sendMessage(EnumQueueName.safeTransactionActions, { id: row.id, params: { id: row.id } })
    }
  },

  /**
   * Decode one row's raw actions the way an execution's are: the Safe is the sender, there is no
   * owning plugin, and `blockNumber` is head because a queued transaction has no block.
   */
  async decode(id: string): Promise<void> {
    const row = await Models.SafeTransaction.findOne({ id })
    // A duplicate job must not redo the work; a row written before the field existed still decodes.
    if (!row || row.decoding === false) return

    // Throws on a failed read so the queue retries; a row that never decodes stays `decoding`.
    const actions = await DaoExecutionHandler.decodeExecutionActions(row.rawActions, {
      daoAddress: row.safeAddress,
      network: row.network,
      blockNumber: row.executionBlockNumber ?? (await ProviderModule.getAnyRpcProvider(row.network).getBlockNumber()),
      throwOnError: true,
    })

    await Models.SafeTransaction.updateOne({ id }, { $set: { actions, decoding: false } })
  },

  /**
   * What we hold for a Safe, newest first, from Mongo alone, in the shape the live read answers plus
   * `state`. `to` filters on `targets`, not the envelope's `to`. No `state` means live and executed,
   * never `superseded`, matching what the untracked path reads.
   */
  async list(
    network: NetworksEnum,
    safeAddress: HexAddress,
    filters: { limit: number; offset: number; state?: ISafeTransactionState; to?: HexAddress },
  ) {
    const { limit, offset, state, to } = filters
    const query = {
      network,
      safeAddress,
      ...(state ? { state } : { state: { $in: [ISafeTransactionState.live, ISafeTransactionState.executed] } }),
      ...(to ? { targets: to } : {}),
    }

    const [count, rows] = await Promise.all([
      Models.SafeTransaction.countDocuments(query),
      Models.SafeTransaction.find(query)
        .select(WIRE_FIELDS)
        .sort({ submissionDate: -1, safeTxHash: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ])

    const results = rows.map(({ executionDate, transactionHash, ...row }) => {
      const isExecuted = row.state === ISafeTransactionState.executed
      return { ...row, ...(isExecuted ? { executionDate, transactionHash } : {}), isExecuted, signatures: null }
    }) as unknown as Array<ISafeMultisigTransaction & { state: ISafeTransactionState }>

    return {
      count,
      next: offset + results.length < count ? String(offset + limit) : null,
      previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
      results,
    }
  },

  /**
   * Reconcile live rows absent from a freshly fetched queue page. A seen `removed` row is live again.
   * Only a complete first page proves that every absent hash has left the service, so a deeper page
   * or an incomplete one marks nothing.
   */
  async reconcileQueue(
    network: NetworksEnum,
    safeAddress: HexAddress,
    seenHashes: string[],
    fetchedAt: number,
    complete: boolean,
  ): Promise<number> {
    if (seenHashes.length) {
      await Models.SafeTransaction.updateMany(
        { network, safeAddress, state: ISafeTransactionState.removed, safeTxHash: { $in: seenHashes } },
        { $set: { state: ISafeTransactionState.live } },
      )
    }

    if (!complete) return 0

    const result = await Models.SafeTransaction.updateMany(
      {
        network,
        safeAddress,
        state: ISafeTransactionState.live,
        safeTxHash: { $nin: seenHashes },
        refreshedAt: { $lt: new Date(fetchedAt) },
      },
      { $set: { state: ISafeTransactionState.removed } },
    )

    return result.modifiedCount
  },

  /**
   * Settle a transaction the chain says has executed. A row we never saw pending is skipped; a later
   * history read brings it in whole. Rivals at the same nonce become `superseded`.
   */
  async markExecuted(
    network: NetworksEnum,
    safeAddress: HexAddress,
    safeTxHash: string,
    execution: { transactionHash: string; blockNumber: number; blockTimestamp?: number; succeeded: boolean },
  ): Promise<boolean> {
    const row = await Models.SafeTransaction.findOne({ network, safeAddress, safeTxHash })
    if (!row) return false

    await Models.SafeTransaction.updateOne(
      { id: row.id },
      {
        $set: {
          state: ISafeTransactionState.executed,
          isSuccessful: execution.succeeded,
          transactionHash: execution.transactionHash,
          executionBlockNumber: execution.blockNumber,
          ...(execution.blockTimestamp
            ? { executionDate: new Date(execution.blockTimestamp * 1000).toISOString() }
            : {}),
        },
      },
    )

    await Models.SafeTransaction.updateMany(
      { network, safeAddress, nonce: row.nonce, state: ISafeTransactionState.live, id: { $ne: row.id } },
      { $set: { state: ISafeTransactionState.superseded } },
    )

    return true
  },

  /**
   * Mark every live or removed row below the Safe's onchain nonce `superseded`. The queue keeps
   * serving an old loser as unexecuted, its winner may sit past the history pages we read, and a
   * removed row cannot be executed once its nonce is spent. Nonces are decimal strings, so the
   * comparison happens here as BigInt, not in the query.
   */
  async settleBelowNonce(network: NetworksEnum, safeAddress: HexAddress): Promise<number> {
    const unsettled = { $in: [ISafeTransactionState.live, ISafeTransactionState.removed] }
    const live = await Models.SafeTransaction.find({ network, safeAddress, state: unsettled }).select('id nonce').lean()
    if (!live.length) return 0

    const nonce = BigInt(await SafeChainReaderModule.readNonce(network, safeAddress))
    const dead = live.filter(row => BigInt(row.nonce) < nonce).map(row => row.id)
    if (!dead.length) return 0

    // The state again in the predicate: an execution landing between the read and this write stays executed.
    const result = await Models.SafeTransaction.updateMany(
      { id: { $in: dead }, state: unsettled },
      { $set: { state: ISafeTransactionState.superseded } },
    )

    return result.modifiedCount
  },

  /** Store a page, decode it and retire what the chain has passed. Throws so the sync job retries. */
  async record(
    network: NetworksEnum,
    safeAddress: HexAddress,
    transactions: ISafeMultisigTransaction[],
    now: number,
  ): Promise<void> {
    await SafeTransactionsModule.upsert(network, safeAddress, transactions, now)
    await SafeTransactionsModule.queueDecodes(
      network,
      safeAddress,
      transactions.map(transaction => transaction.safeTxHash),
    )
    await SafeTransactionsModule.settleBelowNonce(network, safeAddress)
  },
}

export default SafeTransactionsModule
