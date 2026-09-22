import config from '@config'
import ValidationSchema from '@helpers/validationSchema'
import { ISafeTransactionState, NetworksEnum } from '@types'
import Joi from 'joi'

/**
 * Schemas for `/v2/safe/*`.
 *
 * `/v2` is unauthenticated with `Access-Control-Allow-Origin: *`, and these reads sit in front of a
 * shared, metered API key - so the only thing taken from the caller is a network and an address.
 * Notably absent: a `currentNonce` parameter on the next-nonce read. Given one, a caller would
 * eventually pass a polled value, and a nonce allocated from a stale input is a collision that
 * cannot be undone once signatures exist.
 */
const SafeSchema = {
  safeAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  // A `safeTxHash` is a 32-byte EIP-712 digest, so the shape is fixed and anything else cannot name
  // a row we hold.
  transactionActions: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
    safeTxHash: Joi.string()
      .pattern(/^0x[0-9a-fA-F]{64}$/)
      .required(),
  }),

  // Bounded because each miss is one upstream call. The Safe queue of a governance body is a handful
  // of transactions, so a large page buys nothing and a huge one is only useful to an abuser.
  queuePagination: Joi.object({
    limit: Joi.number().integer().min(1).max(config.SAFE_API.MAX_PAGE_SIZE).optional().default(20),
    offset: Joi.number().integer().min(0).max(10_000).optional().default(0),
  }),

  /** Stored rows only, no upstream call, but the same page bound as the reads that make one. */
  storedTransactions: Joi.object({
    limit: Joi.number().integer().min(1).max(config.SAFE_API.MAX_PAGE_SIZE).optional().default(20),
    offset: Joi.number().integer().min(0).max(10_000).optional().default(0),
    state: Joi.string()
      .valid(...Object.values(ISafeTransactionState))
      .optional(),
    // Matched against every address the transaction calls, not the envelope's `to`.
    to: ValidationSchema.joiAddress.optional(),
  }),

  // Same bound as the queue, plus the filters that let a caller scan one target or one nonce window
  // instead of paging a whole Safe history.
  //
  // Nonces are `joiUint256String`, not a bare digit pattern: the value lands verbatim in the Mongo
  // cache key, and `/v2` is unauthenticated. An unbounded digit string would push that key past
  // Mongo's 1024-byte index limit, so the write would throw, be swallowed, and leave the read
  // uncacheable - re-spending the shared hourly budget on every repeat.
  historyQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(config.SAFE_API.MAX_PAGE_SIZE).optional().default(20),
    offset: Joi.number().integer().min(0).max(10_000).optional().default(0),
    to: ValidationSchema.joiAddress.optional(),
    nonce__gte: ValidationSchema.joiUint256String.optional(),
    nonce__lte: ValidationSchema.joiUint256String.optional(),
  }).custom((value, helpers) => {
    // An inverted window is provably empty, but it would still spend a budget unit and retain a
    // cache document, and it offers unlimited distinct key material for doing so.
    const { nonce__gte: gte, nonce__lte: lte } = value as { nonce__gte?: string; nonce__lte?: string }
    if (gte != null && lte != null && BigInt(gte) > BigInt(lte)) {
      return helpers.error('any.invalid')
    }

    return value
  }, 'Nonce window validation'),
}

export default SafeSchema
