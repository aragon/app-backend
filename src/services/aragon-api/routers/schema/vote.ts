import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

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
  }),
}

export default VoteSchema
