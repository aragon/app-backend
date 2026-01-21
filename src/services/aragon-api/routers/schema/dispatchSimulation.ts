import ValidationSchema from '@helpers/validationSchema'
import Joi from 'joi'

/**
 * Schema for dispatch simulation request
 * POST /:network/dispatch/:policyAddress
 */
const DispatchSimulationSchema = {
  simulateDispatch: Joi.object({
    policyAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(require('@types').NetworksEnum))
      .required(),
    from: ValidationSchema.joiAddress.required(),
    data: Joi.string().optional(),
  }),
}

export default DispatchSimulationSchema
