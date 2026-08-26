/**
 * Validate and narrow one page of the Safe Transaction Service queue.
 *
 * Two jobs, both at this boundary so nothing downstream depends on upstream naming:
 *
 * - The upstream calls the proposing owner `proposer`; the wire contract calls it `from`.
 * - Upstream sends `nonce` as a JSON number. Nonces are `uint256`, so a number loses precision past
 *   2^53. Every nonce leaves here as a decimal string.
 *
 * Fields outside the contract are dropped rather than passed through: they would be cached, stored
 * and shipped for nothing, and a silently-widening payload is how a contract stops being one.
 */

import { type ISafeConfirmation, type ISafeMultisigTransaction, type ISafeQueue } from '@types'
import { getAddress } from 'ethers'

/** Decimal digits only. Rejects `-1`, `1e3`, `0x2` and whitespace, all of which `BigInt` accepts. */
const DECIMAL_ONLY = /^\d+$/

/** Upstream may send a numeric nonce or gas value; both forms normalise to a decimal string. */
function toDecimalString(value: unknown): string | null {
  if (typeof value === 'string') {
    if (!DECIMAL_ONLY.test(value) || value.length > 78 || BigInt(value) > (1n << 256n) - 1n) return null

    return value
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)

  return null
}

function checksummedAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    return getAddress(value)
  } catch (_error) {
    return null
  }
}

function parseConfirmation(value: unknown): ISafeConfirmation | null {
  if (typeof value !== 'object' || value === null) return null

  const { owner, signature, signatureType, submissionDate } = value as Record<string, unknown>

  const normalizedOwner = checksummedAddress(owner)
  if (normalizedOwner == null || typeof signature !== 'string' || typeof submissionDate !== 'string') return null
  if (signatureType !== undefined && typeof signatureType !== 'string') return null

  return { owner: normalizedOwner, signature, signatureType, submissionDate }
}

export function parseTransaction(value: unknown): ISafeMultisigTransaction | null {
  if (typeof value !== 'object' || value === null) return null

  const {
    safeTxHash,
    nonce,
    proposer,
    to,
    value: nativeValue,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    confirmations,
    confirmationsRequired,
    signatures,
    isExecuted,
    isSuccessful,
    submissionDate,
  } = value as Record<string, unknown>

  if (typeof safeTxHash !== 'string' || typeof submissionDate !== 'string') return null
  if (typeof proposer !== 'string' && proposer !== null) return null
  if (typeof data !== 'string' && data !== null) return null

  const normalizedFrom = proposer === null ? null : checksummedAddress(proposer)
  const normalizedTo = checksummedAddress(to)
  const normalizedGasToken = checksummedAddress(gasToken)
  const normalizedRefundReceiver = checksummedAddress(refundReceiver)
  if (normalizedFrom == null && proposer !== null) return null
  if (normalizedTo == null || normalizedGasToken == null || normalizedRefundReceiver == null) return null
  if (operation !== 0 && operation !== 1) return null
  if (typeof isExecuted !== 'boolean') return null
  if (typeof isSuccessful !== 'boolean' && isSuccessful !== null) return null
  if (typeof signatures !== 'string' && signatures !== null && signatures !== undefined) return null

  // The app requires a positive integer: a transaction needing zero confirmations is not a Safe
  // transaction, it is a malformed payload.
  if (typeof confirmationsRequired !== 'number' || !Number.isInteger(confirmationsRequired)) return null
  if (confirmationsRequired <= 0) return null

  const parsedNonce = toDecimalString(nonce)
  const parsedValue = toDecimalString(nativeValue)
  const parsedSafeTxGas = toDecimalString(safeTxGas)
  const parsedBaseGas = toDecimalString(baseGas)
  const parsedGasPrice = toDecimalString(gasPrice)

  if (parsedNonce == null || parsedValue == null) return null
  if (parsedSafeTxGas == null || parsedBaseGas == null || parsedGasPrice == null) return null

  if (!Array.isArray(confirmations)) return null

  const parsedConfirmations: ISafeConfirmation[] = []
  for (const entry of confirmations) {
    const confirmation = parseConfirmation(entry)
    if (confirmation == null) return null

    parsedConfirmations.push(confirmation)
  }

  return {
    safeTxHash,
    nonce: parsedNonce,
    from: normalizedFrom,
    to: normalizedTo,
    value: parsedValue,
    data,
    operation,
    safeTxGas: parsedSafeTxGas,
    baseGas: parsedBaseGas,
    gasPrice: parsedGasPrice,
    gasToken: normalizedGasToken,
    refundReceiver: normalizedRefundReceiver,
    confirmations: parsedConfirmations,
    confirmationsRequired,
    signatures: signatures ?? null,
    isExecuted,
    isSuccessful,
    submissionDate,
  }
}

/**
 * Parse a paginated queue page. `null` means the page did not match the contract - the caller turns
 * that into `502 invalid-response` rather than shipping a half-understood payload to a signing UI.
 */
export function parseQueuePage(value: unknown): ISafeQueue | null {
  if (typeof value !== 'object' || value === null) return null

  const { count, next, previous, results } = value as Record<string, unknown>

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null
  if (typeof next !== 'string' && next !== null) return null
  if (typeof previous !== 'string' && previous !== null) return null
  if (!Array.isArray(results)) return null

  const parsed: ISafeMultisigTransaction[] = []
  for (const entry of results) {
    const transaction = parseTransaction(entry)
    if (transaction == null) return null

    parsed.push(transaction)
  }

  return { count, next, previous, results: parsed }
}

/**
 * The highest nonce any queued transaction holds, or null when nothing is queued.
 *
 * Recomputed with big integers instead of trusting row order: the transaction service answers 200
 * and silently ignores an `ordering` value it does not recognise, so a future rename would degrade
 * into a wrong nonce rather than an error - and a wrong nonce here is a collision that cannot be
 * undone once signatures exist.
 */
export function highestQueuedNonce(transactions: ISafeMultisigTransaction[]): bigint | null {
  let highest: bigint | null = null

  for (const transaction of transactions) {
    const nonce = BigInt(transaction.nonce)
    if (highest == null || nonce > highest) highest = nonce
  }

  return highest
}
