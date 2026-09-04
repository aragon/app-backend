import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
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

  // Bounded because each miss is one upstream call. The Safe queue of a governance body is a handful
  // of transactions, so a large page buys nothing and a huge one is only useful to an abuser.
  queuePagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    offset: Joi.number().integer().min(0).max(10_000).optional().default(0),
  }),

  // Same bound as the queue, plus the filters that let a caller scan one target or one nonce window
  // instead of paging a whole Safe history. Nonces are strings: a `uint256` past 2^53 loses
  // precision as a JSON number, and this value is forwarded to the upstream verbatim.
  historyQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    offset: Joi.number().integer().min(0).max(10_000).optional().default(0),
    to: ValidationSchema.joiAddress.optional(),
    nonce__gte: Joi.string().pattern(/^\d+$/).optional(),
    nonce__lte: Joi.string().pattern(/^\d+$/).optional(),
  }),
}

export default SafeSchema
