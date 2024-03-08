import { ErrorKey, throwExposable } from '@helpers/errors'
import Joi from 'joi'

const ValidationSchema = {
  Joi,
  joiUuid: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
  joiEmail: Joi.string().regex(
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/,
  ),

  generateJoiPagination: (fromDate?: string) => ({
    search: Joi.string().allow('').optional(),
    limit: Joi.number().integer().optional().default(10),
    offset: Joi.number().integer().greater(-1).optional().default(0),
    order: Joi.string().valid('asc', 'desc').optional().default('asc'),
    orderProp: Joi.string().valid('createdAt').optional().default('createdAt'),
    fromDate: Joi.date().optional(),
    toDate: Joi.date()
      .min(Joi.ref('fromDate', { adjust: value => new Date(value) }))
      .optional(),
  }),

  async validateParams(schema: Joi.Schema, params: any) {
    try {
      const res = await schema.validateAsync(params, { presence: 'required' })
      return res
    } catch (error: any) {
      const validationError = {
        params,
        errors: error.details.map((detail: any) => detail.message),
      }

      if (validationError.params.password) {
        delete validationError.params.password
      }

      throwExposable(ErrorKey.badParams, undefined, undefined, {
        validationError,
      })
    }
  },
}

export default ValidationSchema
