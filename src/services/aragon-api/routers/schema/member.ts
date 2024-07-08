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

  getMemberByAddress: Joi.object({
    address: ValidationSchema.joiAddress.required(),
  }),

  getActiveMembersExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
  }),
}

export default MemberSchema
