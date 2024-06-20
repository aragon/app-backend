import Joi from 'joi'
import ValidationSchema from '@helpers/validationSchema'

const PaginationSchema = {
  getPagination: Joi.object(ValidationSchema.generateJoiPagination),
}

export default PaginationSchema
