import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const SettingSchema = {
  getExtraParams: Joi.object({
    onlyActive: Joi.boolean().optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.optional(),
  }),

  getSettingById: Joi.object({
    id: Joi.string().required(),
  }),

  getSettingByDaoAddress: Joi.object({
    daoAddress: ValidationSchema.joiAddress.required(),
    network: Joi.required()
      .valid(...Object.values(NetworksEnum))
      .optional(),
  }),
}

export default SettingSchema
