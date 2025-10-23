import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const GaugeSchema = {
  getGaugeParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),

  getGaugeEpochMetricsParams: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    memberAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
  }),
}

export default GaugeSchema
