import config from '@config'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

/**
 * `actions` payload shared by the batch decode endpoints: an array of raw
 * `[to, data, value]` tuples, capped so a single request cannot fan out into an
 * unbounded number of source-code lookups.
 */
const decodeBatchActions = Joi.array()
  .items(
    Joi.object({
      to: ValidationSchema.joiAddress.required(),
      data: Joi.string().required(),
      value: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).default('0'),
    }),
  )
  .min(1)
  .max(config.SERVICES.ARAGON_API.DECODE_ACTION_BATCH_LIMIT)
  .required()

const ContractDetailsSchema = {
  getContractDetails: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    address: ValidationSchema.joiAddress.required(),
  }),

  getContractDetailsV2: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  decodeActionData: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    to: ValidationSchema.joiAddress.required(),
    data: Joi.string().required(),
    value: Joi.any().allow(null),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
  }),

  decodeActionDataV2: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    to: ValidationSchema.joiAddress.required(),
    data: Joi.string().required(),
    value: Joi.any().allow(null),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  /**
   * @deprecated Superseded by `decodeActionBatchV3`, which makes `from` optional. Kept for the V2
   * route until its clients have migrated.
   */
  decodeActionBatchV2: Joi.object({
    from: ValidationSchema.joiAddress.required(),
    actions: decodeBatchActions,
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  /**
   * V3 drops `from` from the route path: the light decoder never reads it, it is only
   * echoed back on each result, so callers that have no DAO context can omit it.
   */
  decodeActionBatchV3: Joi.object({
    from: ValidationSchema.joiAddress.optional(),
    actions: decodeBatchActions,
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default ContractDetailsSchema
