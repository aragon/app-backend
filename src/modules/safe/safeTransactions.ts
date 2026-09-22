/**
 * Keeps `SafeTransaction` rows in step with the Safe service, written from the pages the gateway
 * already fetches. A row leaves `live` when an execution event or history page names the winner at
 * its nonce, or when the Safe's onchain nonce has passed it.
 */

import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import logger from '@logger'
import type Proposal from '@models/schema/proposal'
import ProviderModule from '@modules/provider'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import {
  type HexAddress,
  type IRawAction,
  type ISafeMultisigTransaction,
  ISafeTransactionState,
  type NetworksEnum,
} from '@types'
import { AbiCoder, getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeTransactions' })

/** `multiSend(bytes)` */
const MULTISEND_SELECTOR = '0x8d80ff0a'

/** Per inner call: `operation(1) to(20) value(32) dataLength(32) data(n)`, packed with no padding. */
const MULTISEND_CALL_HEADER = 170

/** Rows decoded per pass; each costs ABI lookups and a backfill can land hundreds. */
const DECODE_BATCH = 25

/**
 * The calls packed inside a `multiSend` payload. The outer `bytes` is ABI-decoded so only the
 * declared bytes are walked; a call running past the end means a malformed payload and the caller
 * falls back to the envelope.
 */
function multiSendActions(data: string): IRawAction[] {
  const [payload] = AbiCoder.defaultAbiCoder().decode(['bytes'], `0x${data.slice(MULTISEND_SELECTOR.length)}`)
  const packed = (payload as string).slice(2)
  const actions: IRawAction[] = []
  let cursor = 0

  while (cursor < packed.length) {
    if (cursor + MULTISEND_CALL_HEADER > packed.length) throw new Error('MultiSend call header runs past the payload')
    const length = Number(BigInt(`0x${packed.slice(cursor + 106, cursor + MULTISEND_CALL_HEADER)}`)) * 2
    const start = cursor + MULTISEND_CALL_HEADER
    if (!Number.isSafeInteger(length) || start + length > packed.length) {
      throw new Error('MultiSend call data runs past the payload')
    }

    actions.push({
      to: `0x${packed.slice(cursor + 2, cursor + 42)}`,
      value: BigInt(`0x${packed.slice(cursor + 42, cursor + 106)}`).toString(),
      data: `0x${packed.slice(start, start + length)}`,
    })
    cursor = start + length
  }

  return actions
}

/** A Safe transaction as the raw actions it performs. Split only; `DecodeActions` decodes off the refresh path. */
function rawActionsOf(transaction: ISafeMultisigTransaction): IRawAction[] {
  const envelope: IRawAction = {
    to: transaction.to,
    value: transaction.value ?? '0',
    data: transaction.data ?? '0x',
  }

  if (envelope.data.slice(0, 10).toLowerCase() !== MULTISEND_SELECTOR) return [envelope]

  try {
    const inner = multiSendActions(envelope.data)

    return inner.length ? inner : [envelope]
  } catch (error) {
    logger.warn('Unable to split a MultiSend transaction', llo({ safeTxHash: transaction.safeTxHash, error }))

    return [envelope]
  }
}

/** The addresses those actions call. Non-addresses are dropped rather than failing the row. */
function targetsOf(actions: IRawAction[]): HexAddress[] {
  const unique = new Set<HexAddress>()

  for (const action of actions) {
    try {
      unique.add(getAddress(action.to) as HexAddress)
    } catch {
      // Nothing can be asked of a target that is not an address.
    }
  }

  return [...unique]
}

const SafeTransactionsModule = {
  /** Every address a transaction calls, for a transaction we never stored. */
  targetsFor(transaction: ISafeMultisigTransaction): HexAddress[] {
    return targetsOf(rawActionsOf(transaction))
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
      const rawActions = rawActionsOf(transaction)

      return {
        updateOne: {
          filter: { network, safeAddress, safeTxHash: transaction.safeTxHash },
          update: {
            $set: {
              nonce: transaction.nonce,
              to: transaction.to,
              rawActions,
              targets: targetsOf(rawActions),
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
   * Decode the raw actions of rows that still owe a decode; a failed row is picked up next pass.
   * `DecodeActions` reads four proposal fields: the Safe is the sender, there is no owning plugin, and
   * `blockNumber` is head because a queued transaction has no block.
   */
  async decodePending(network: NetworksEnum, safeAddress: HexAddress): Promise<number> {
    const rows = await Models.SafeTransaction.find({ network, safeAddress, decoding: true }).limit(DECODE_BATCH)
    if (!rows.length) return 0

    const decoder = new DecodeActions()
    let head: number | null = null
    let decoded = 0

    for (const row of rows) {
      try {
        if (row.executionBlockNumber == null && head == null) {
          head = await ProviderModule.getAnyRpcProvider(network).getBlockNumber()
        }

        const document = {
          network,
          daoAddress: safeAddress,
          blockNumber: row.executionBlockNumber ?? head!,
        } as Partial<Proposal>

        const actions = await Promise.all(
          row.rawActions.map(async action => {
            const raw = { to: action.to, value: action.value, data: action.data } as IRawAction

            return raw.data?.length >= 10
              ? await decoder.decodeData(raw, document)
              : await decoder.decodeTransfer(raw, document)
          }),
        )

        await Models.SafeTransaction.updateOne(
          { id: row.id },
          { $set: { actions: actions.filter(Boolean), decoding: false } },
        )
        decoded += 1
      } catch (error) {
        logger.warn(
          'Unable to decode a Safe transaction',
          llo({ network, safeAddress, safeTxHash: row.safeTxHash, error }),
        )
      }
    }

    return decoded
  },

  /**
   * What we hold for a Safe, newest first, from Mongo alone. `to` filters on `targets`, not the
   * envelope's `to`. No `state` means live and executed, never `superseded`, matching what the
   * untracked path reads.
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

    const [count, results] = await Promise.all([
      Models.SafeTransaction.countDocuments(query),
      Models.SafeTransaction.find(query).sort({ submissionDate: -1, safeTxHash: 1 }).skip(offset).limit(limit).lean(),
    ])

    // The oldest row on the page, because a page is only as current as its stalest member.
    let refreshedAt: Date | null = null
    for (const row of results) {
      if (refreshedAt == null || row.refreshedAt < refreshedAt) refreshedAt = row.refreshedAt
    }

    return {
      count,
      next: offset + results.length < count ? String(offset + limit) : null,
      previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
      results,
      refreshedAt: refreshedAt?.toISOString() ?? null,
    }
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
            ? {
                executionBlockTimestamp: execution.blockTimestamp,
                executionDate: new Date(execution.blockTimestamp * 1000).toISOString(),
              }
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
   * Mark every live row below the Safe's onchain nonce `superseded`. The queue keeps serving an old
   * loser as unexecuted, and its winner may sit past the history pages we read. Nonces are decimal
   * strings, so the comparison happens here as BigInt, not in the query.
   */
  async settleBelowNonce(network: NetworksEnum, safeAddress: HexAddress): Promise<number> {
    const live = await Models.SafeTransaction.find({ network, safeAddress, state: ISafeTransactionState.live })
      .select('id nonce')
      .lean()
    if (!live.length) return 0

    const nonce = BigInt(await SafeChainReaderModule.readNonce(network, safeAddress))
    const dead = live.filter(row => BigInt(row.nonce) < nonce).map(row => row.id)
    if (!dead.length) return 0

    const result = await Models.SafeTransaction.updateMany(
      { id: { $in: dead } },
      { $set: { state: ISafeTransactionState.superseded } },
    )

    return result.modifiedCount
  },

  /** Store a page, decode it and retire what the chain has passed, without failing the read it came from. */
  async record(
    network: NetworksEnum,
    safeAddress: HexAddress,
    transactions: ISafeMultisigTransaction[],
    now: number,
  ): Promise<void> {
    try {
      await SafeTransactionsModule.upsert(network, safeAddress, transactions, now)
      await SafeTransactionsModule.decodePending(network, safeAddress)
      await SafeTransactionsModule.settleBelowNonce(network, safeAddress)
    } catch (error) {
      logger.warn('Unable to record Safe transactions', llo({ network, safeAddress, error }))
    }
  },
}

export default SafeTransactionsModule
