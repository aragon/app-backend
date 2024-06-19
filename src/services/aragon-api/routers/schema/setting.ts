import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const SettingSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      daoAddress: ValidationSchema.joiAddress.optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
    }),
  ),

  getSettingById: Joi.object({
    id: Joi.string().required(),
  }),

  getSettingByTransactionHash: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    fromTxHash: ValidationSchema.joiAddress.required(),
  }),
}

export default SettingSchema
