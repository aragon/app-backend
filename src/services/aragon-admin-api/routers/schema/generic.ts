import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const GenericSchema = {
  defaultParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),

  queueProposalMetrics: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    proposalIndex: Joi.string().required(),
  }),
}

export default GenericSchema
