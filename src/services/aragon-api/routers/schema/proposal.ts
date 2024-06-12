import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const ProposalSchema = {
  getByDao: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
    }),
  ),

  getByMember: Joi.object(
    Object.assign(ValidationSchema.generateJoiPagination, {
      permalink: Joi.string().required(),
      memberAddress: ValidationSchema.joiAddress.required(),
    }),
  ),
}

export default ProposalSchema
