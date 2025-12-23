import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'
import Joi from 'joi'

const VoteSchema = {
  getExtraParams: Joi.object({
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .optional(),
    daoAddress: ValidationSchema.joiAddress.optional(),
    pluginAddress: ValidationSchema.joiAddress.optional(),
    tokenAddress: ValidationSchema.joiAddress.optional(),
    memberAddress: ValidationSchema.joiAddress.optional(),
    includeInfo: Joi.boolean().optional(),
    highlightUser: ValidationSchema.joiAddress.optional(),
  }),

  canVote: Joi.object({
    pluginAddress: ValidationSchema.joiAddress.required(),
    memberAddress: ValidationSchema.joiAddress.required(),
    network: Joi.string()
      .valid(...Object.values(NetworksEnum))
      .required(),
    proposalIndex: Joi.string().required(),
  }),
}

export default VoteSchema
