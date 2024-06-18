import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'
import { NetworksEnum } from '@types'

const ProposalSchema = {
  getWithPagination: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      network: Joi.string()
        .valid(...Object.values(NetworksEnum))
        .optional(),
      daoAddress: ValidationSchema.joiAddress.optional(),
      pluginAddress: ValidationSchema.joiAddress.optional(),
      creatorAddress: ValidationSchema.joiAddress.optional(),
    }),
  ),

  getProposalById: Joi.object({
    id: ValidationSchema.joiAddress.optional(),
  }),
}

export default ProposalSchema
