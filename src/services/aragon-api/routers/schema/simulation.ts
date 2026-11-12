import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum, safeTxServiceShortNames } from '@types'
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
}

export default SimulationSchema
