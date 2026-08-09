import ValidationSchema from '@helpers/validationSchema'
import { MAX_ACTION_CALLDATA_BYTES, MAX_ACTIONS, MAX_TOTAL_CALLDATA_BYTES } from '@modules/crossChainGas/constants'
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
    destinationChainId: ValidationSchema.joiKnownChainId.required(),
    actions: Joi.array()
      .items(
        Joi.object({
          to: ValidationSchema.joiAddress.required(),
          // `validateRoute` validates with `presence: 'required'`, under which a `.default()` on
          // its own is never reached - the key has to be marked optional for it to apply.
          value: ValidationSchema.joiUint256String.optional().default('0'),
          data: ValidationSchema.joiHexData(MAX_ACTION_CALLDATA_BYTES).optional().default('0x'),
        }),
      )
      .min(1)
      .max(MAX_ACTIONS)
      .custom((actions: Array<{ data?: string }>, helpers) => {
        const totalBytes = actions.reduce((total, action) => total + ((action.data ?? '0x').length - 2) / 2, 0)
        return totalBytes <= MAX_TOTAL_CALLDATA_BYTES ? actions : helpers.error('array.calldataSize')
      })
      .messages({
        'array.calldataSize': `{{#label}} must contain at most ${MAX_TOTAL_CALLDATA_BYTES} bytes of calldata`,
      })
      .required(),
  }),
}

export default CrossChainGasSchema
