import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const PaginationSchema = {
  getPagination: Joi.object(ValidationSchema.generateJoiPagination),

  getPairParams: Joi.object({
    daoId: ValidationSchema.joiDaoId.optional(),
    ens: ValidationSchema.joiEns.optional(),
    proposalId: Joi.string().optional(),
    onlyActive: Joi.boolean().optional(),
  }),

  getNotAllowedParams: Joi.object().max(0),
}

export default PaginationSchema
