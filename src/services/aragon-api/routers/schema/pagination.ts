import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const PaginationSchema = {
  getPagination: Joi.object(ValidationSchema.generateJoiPagination),
  getPairParams: Joi.object({
    daoId: ValidationSchema.joiDaoId.optional(),
    ens: ValidationSchema.joiEns.optional(),
  }),
}

export default PaginationSchema
