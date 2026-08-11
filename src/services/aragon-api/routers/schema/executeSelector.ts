import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const ExecuteSelectorSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    conditionAddress: ValidationSchema.joiAddress.optional(),
    chainId: Joi.number().integer().positive().optional(),
  }),
}

export default ExecuteSelectorSchema
