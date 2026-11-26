import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum, safeTxServiceShortNames } from '@types'
import { MaxUint256 } from 'ethers'
import Joi from 'joi'

const SimulationSchema = {
  simulate: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          data: Joi.string().required(),
          value: Joi.string().default('0'),
        }),
      )
      .min(1)
      .required(),
  }),

  simulateDirectExecute: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    from: ValidationSchema.joiAddress.required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          data: Joi.string().required(),
          value: Joi.string().default('0'),
        }),
      )
      .min(1)
      .required(),
  }),

  simulationProposal: Joi.object({
    proposalId: Joi.string().required(),
  }),

  proposalBody: Joi.object({}).unknown(false),

  // Only the networks the Safe proxy serves; any other is a 400 before a queue round trip.
  safeTransaction: Joi.object({
    network: Joi.string()
      .valid(...(Object.keys(safeTxServiceShortNames) as NetworksEnum[]))
      .required(),
    safeAddress: ValidationSchema.joiAddress.required(),
    safeTxHash: Joi.string()
      .pattern(/^0x[0-9a-fA-F]{64}$/)
      .lowercase()
      .required(),
  }),

  // A Safe transaction not created yet, as the app will propose it: the fields that decide what it runs.
  safeActions: Joi.object({
    network: Joi.string()
      .valid(...(Object.keys(safeTxServiceShortNames) as NetworksEnum[]))
      .required(),
    safeAddress: ValidationSchema.joiAddress.required(),
    to: ValidationSchema.joiAddress.required(),
    // Optional: validation runs with `presence: 'required'`, under which a default alone never applies.
    value: Joi.string()
      .pattern(/^\d{1,78}$/)
      .custom((value, helpers) => (BigInt(value) <= MaxUint256 ? value : helpers.error('any.invalid')))
      .optional()
      .default('0'),
    data: Joi.string()
      .pattern(/^0x([0-9a-fA-F]{2})*$/)
      .optional()
      .default('0x'),
    operation: Joi.number().valid(0, 1).required(),
  }),
}

export default SimulationSchema
