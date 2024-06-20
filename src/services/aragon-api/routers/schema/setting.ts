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

  getSettingByTransactionHash: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    fromTxHash: ValidationSchema.joiTransactionHash.required(),
  }),
}

export default SettingSchema
