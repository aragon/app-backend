import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const MemberSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
  }),

  getExtraParamsV2: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
  }),

  getMemberLocksParams: Joi.object({
    memberAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    escrowAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    onlyActive: Joi.boolean().optional(),
  }),

  getMemberLocksParamsV2: Joi.object({
    memberAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    escrowAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    onlyActive: Joi.boolean().optional(),
  }),

  getMemberById: Joi.object({
    id: ValidationSchema.joiAddress.optional(),
  }),

  getMemberByAddress: Joi.object({
    address: ValidationSchema.joiAddress.required(),
  }),

  isMemberOfPlugin: Joi.object({
    memberAddress: ValidationSchema.joiAddress.required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),

  isMemberOfPluginV2: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    memberAddress: ValidationSchema.joiAddress.required(),
    pluginAddress: ValidationSchema.joiAddress.required(),
  }),
}

export default MemberSchema
