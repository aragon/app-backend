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
import logger from '@logger'
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
              executionDate: transaction.executionDate ?? null,
              transactionHash: transaction.transactionHash ?? null,
              isSuccessful: transaction.isSuccessful,
              refreshedAt,
              ...(transaction.isExecuted ? { state: ISafeTransactionState.executed } : {}),
            },
            $setOnInsert: {
              id: Models.SafeTransaction.buildId(network, safeAddress, transaction.safeTxHash),
              network,
              safeAddress,
              safeTxHash: transaction.safeTxHash,
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

    const result = await Models.SafeTransaction.updateMany(
      { id: { $in: dead } },
      { $set: { state: ISafeTransactionState.superseded } },
    )
    logger.verbose('Safe transactions superseded', llo({ network, safeAddress, count: result.modifiedCount }))

    return result.modifiedCount
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
    } catch (error) {
      logger.warn('Unable to record Safe transactions', llo({ network, safeAddress, error }))
    }
  },
}

export default SafeTransactionsModule
