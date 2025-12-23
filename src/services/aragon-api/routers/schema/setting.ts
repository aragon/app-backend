import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const SettingSchema = {
  getExtraParams: Joi.object({
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
  }),

  getDaoByIdV2: Joi.object({
    id: ValidationSchema.joiDaoId.required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),

  getSettingById: Joi.object({
    id: Joi.string().required(),
  }),

  getSettingByDaoAddress: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.required()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
  }),

  getSettingByDaoAddressV2: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.required()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),
}

export default SettingSchema
