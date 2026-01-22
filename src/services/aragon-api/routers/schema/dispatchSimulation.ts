import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

/**
 * Schema for dispatch simulation request
 * POST /:network/dispatch/:policyAddress
 */
const DispatchSimulationSchema = {
  simulateDispatch: Joi.object({
    policyAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    from: ValidationSchema.joiAddress.required(),
    data: Joi.string().optional(),
  }),
}

export default DispatchSimulationSchema
