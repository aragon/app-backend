import ValidationSchema from '@helpers/validationSchema'
import { MAX_ACTIONS } from '@modules/crossChainGas'
import { NetworksEnum } from '@types'
import Joi from 'joi'

/**
 * Schema for cross-chain gas limit estimation
 * POST /:network/cross-chain/:controllerAddress/gas-limit
 *
 * This is the only place the request is validated - the service trusts what it is handed.
 *
 * Note what is absent from the request: adapter addresses, router addresses and chain selectors
 * are all read from the chain, so a caller cannot point the simulation at contracts of their
 * choosing. The bounds below exist because the endpoint triggers a third-party simulation.
 */
const CrossChainGasSchema = {
  estimateGasLimit: Joi.object({
    controllerAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    // Standard EVM chain id (Base = 8453), not a CCIP selector.
    destinationChainId: Joi.number().integer().positive().required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          value: Joi.string().default('0'),
          data: Joi.string()
            .pattern(/^0x([0-9a-fA-F]{2})*$/)
            .optional()
            .default('0x')
            .messages({ 'string.pattern.base': '{{#label}} must be a hex string' }),
        }),
      )
      .min(1)
      .max(MAX_ACTIONS)
      .required(),
  }),
}

export default CrossChainGasSchema
