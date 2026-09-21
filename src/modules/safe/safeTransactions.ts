/**
 * Keeping `SafeTransaction` rows in step with the Safe service.
 *
 * Rows are written from the queue pages the gateway already fetches, so a Safe nobody looks at costs
 * nothing and a Safe somebody is watching stays current for free.
 *
 * Which rows are dead is settled by the Safe's onchain nonce, not by the service: a Safe executes in
 * strict nonce order, so anything still unexecuted below the current nonce can never execute again.
 * The transaction that did execute at that nonce is not in an `executed=false` page at all, so every
 * row this sees below the nonce is a loser and `superseded` is the honest answer for all of them.
 */

import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import logger from '@logger'
import type Proposal from '@models/schema/proposal'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type IRawAction,
  type ISafeMultisigTransaction,
  ISafeTransactionState,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeTransactions' })

/** `multiSend(bytes)` */
const MULTISEND_SELECTOR = '0x8d80ff0a'

/** Per inner call: `operation(1) to(20) value(32) dataLength(32) data(n)`, packed with no padding. */
const MULTISEND_CALL_HEADER = 170

/**
 * Rows decoded per pass. A history backfill can land hundreds at once and each one costs ABI
 * lookups, so the rest wait for the next read rather than holding one up for minutes.
 */
const DECODE_BATCH = 25

/**
 * The calls packed inside a `multiSend` payload.
 *
 * A malformed tail ends the walk rather than failing the row, because the calls already read are
 * still true.
 *
 * `safeProposalReports` on development walks the same payload to find report calls. Worth folding
 * into one walker once this branch catches up with it.
 */
function multiSendActions(data: string): IRawAction[] {
  // ABI-encoded `bytes`: a 32-byte offset and a 32-byte length before the packed calls.
  const packed = data.slice(MULTISEND_SELECTOR.length + 128)
  const actions: IRawAction[] = []
  let cursor = 0

  while (cursor + MULTISEND_CALL_HEADER <= packed.length) {
    const length = Number(BigInt(`0x${packed.slice(cursor + 106, cursor + MULTISEND_CALL_HEADER)}`)) * 2
    const start = cursor + MULTISEND_CALL_HEADER
    if (!Number.isSafeInteger(length) || start + length > packed.length) break

    actions.push({
      to: `0x${packed.slice(cursor + 2, cursor + 42)}`,
      value: BigInt(`0x${packed.slice(cursor + 42, cursor + 106)}`).toString(),
      data: `0x${packed.slice(start, start + length)}`,
    })
    cursor = start + length
  }

  return actions
}

/**
 * A Safe transaction as the actions it performs, in the shape a DAO `Executed` event already hands
 * over. Splitting is all that happens here: `DecodeActions` turns these into readable actions later,
 * off the refresh path, because it costs ABI lookups.
 */
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
  /**
   * Every address a transaction calls, for a caller holding one we never stored.
   *
   * A Safe we do not track is answered live, and the same question has to be asked of it the same
   * way: filtering an untracked Safe on its envelope's `to` would drop every batch, which is the
   * whole reason `targets` exists on a stored row.
   */
  targetsFor(transaction: ISafeMultisigTransaction): HexAddress[] {
    return targetsOf(rawActionsOf(transaction))
  },

  /**
   * Write one queue page. Confirmations and state are refreshed on every pass, because an owner can
   * sign in the Safe app and a row can die while nobody was reading it.
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

    return result.upsertedCount + result.modifiedCount
  },

  /**
   * Turn the raw actions of newly stored rows into readable ones.
   *
   * Only rows that still owe a decode are read, so a queue refresh that brings nothing new does no
   * work and a row whose decode failed is simply picked up by the next pass.
   *
   * `DecodeActions` is written against a proposal but only reads four fields off it, and three of
   * them have an honest Safe answer: the Safe is the sender, the execution block is the block, and
   * there is no owning plugin. The fourth, `blockNumber`, only feeds the balance shown on a mint -
   * a queued transaction has no block of its own, so head is what "if this executed now" means. It
   * is a forecast either way and is not sharpened once the transaction executes.
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
   * What we hold for a Safe, newest first, answered from Mongo alone.
   *
   * `to` filters on `targets` rather than on the envelope's own `to`, which is the whole point of
   * storing them: a batched transaction's `to` is the MultiSend contract, so asking the envelope
   * whether it concerns a DAO answers no for every batch the app composes.
   *
   * Rows are only as fresh as the last read that touched them, so the answer carries when that was.
   * Nothing here goes upstream - a caller wanting certainty reads the queue.
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
      ...(state ? { state } : {}),
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
   * Mark everything the Safe has moved past. One read of the live rows for this Safe - a governance
   * Safe holds a handful - and BigInt decides, because a uint256 decimal string does not sort as a
   * number in Mongo.
   */
  async reconcile(network: NetworksEnum, safeAddress: HexAddress, currentNonce: string): Promise<number> {
    const live = await Models.SafeTransaction.find(
      { network, safeAddress, state: ISafeTransactionState.live },
      { id: 1, nonce: 1 },
    ).lean()
    if (!live.length) return 0

    const current = BigInt(currentNonce)
    const dead = live.filter(row => BigInt(row.nonce) < current).map(row => row.id)
    if (!dead.length) return 0

    // Still `live` in the predicate, not only in the read above. The execution handler can settle
    // one of these rows in between, and it knows something this does not - which transaction won.
    // Without the guard a confirmed execution gets overwritten as superseded.
    const result = await Models.SafeTransaction.updateMany(
      { id: { $in: dead }, state: ISafeTransactionState.live },
      { $set: { state: ISafeTransactionState.superseded } },
    )
    logger.verbose('Safe transactions superseded', llo({ network, safeAddress, count: result.modifiedCount }))

    return result.modifiedCount
  },

  /**
   * Settle a transaction the chain says has executed.
   *
   * The event carries the `safeTxHash`, so the row is found directly rather than matched on anything.
   * A row we never saw pending is skipped: without its envelope there is nothing to show, and a
   * later history read brings it in whole.
   *
   * The rivals go with it. A Safe executes one transaction per nonce, so every other live row at
   * this one's nonce can never execute again - and unlike reconciling against the chain nonce, here
   * we know which one won, so the winner is `executed` and only the losers are `superseded`.
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
   * Store a page and settle what it implies, without ever failing the read it came from. A list that
   * could not be written is a stale list next time, not a failed request now.
   */
  async record(
    network: NetworksEnum,
    safeAddress: HexAddress,
    transactions: ISafeMultisigTransaction[],
    currentNonce: string | null,
    now: number,
  ): Promise<void> {
    try {
      await SafeTransactionsModule.upsert(network, safeAddress, transactions, now)
      if (currentNonce != null) await SafeTransactionsModule.reconcile(network, safeAddress, currentNonce)
      await SafeTransactionsModule.decodePending(network, safeAddress)
    } catch (error) {
      logger.warn('Unable to record Safe transactions', llo({ network, safeAddress, error }))
    }
  },
}

export default SafeTransactionsModule
