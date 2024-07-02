import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const MemberSchema = {
  getExtraParams: Joi.object({
    onlyActive: Joi.boolean().optional(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
  }),

  getDaoById: Joi.object({
    id: ValidationSchema.joiDaoId.optional(),
  }),

  getMemberById: Joi.object({
    id: ValidationSchema.joiAddress.optional(),
  }),

  getActiveMembersByPluginAddress: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),
}

export default MemberSchema
