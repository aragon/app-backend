import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const DaoSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    address: ValidationSchema.joiAddress.optional(),
  }),

  getDaosByMember: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    memberAddress: Joi.alternatives().try(ValidationSchema.joiAddress.required(), ValidationSchema.joiEns.required()),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.required(),
  }),

  getDaoByAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    address: ValidationSchema.joiAddress.required(),
  }),
}

export default DaoSchema
