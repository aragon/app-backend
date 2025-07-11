import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const ExecuteSelectorSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    conditionAddress: ValidationSchema.joiAddress.optional()
  }),
}

export default ExecuteSelectorSchema
