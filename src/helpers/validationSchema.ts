import { ErrorKeyEnum } from '@types'
import { throwExposable } from '@helpers/errors'
import Joi from 'joi'
import { getAddress } from 'ethers'

const ValidationSchema = {
  Joi,
  joiUuid: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
  joiEmail: Joi.string().regex(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/),
  joiAddress: Joi.string()
    .required()
    .custom((value, helpers) => {
      try {
        return getAddress(value)
      } catch (error) {
        return helpers.error('string.invalid', { value })
      }
    }, 'Address Validation')
    .messages({
      'string.invalid': '{{#label}} is not a valid address',
    }),

  generateJoiPagination: {
    search: Joi.string()
      .allow('')
      .optional()
      .custom(value => {
        try {
          return getAddress(value)
        } catch {
          return value
        }
      }, 'Address or General Search Validation'),
    pageSize: Joi.number().integer().optional().default(10),
    page: Joi.number().integer().greater(-1).optional().default(1),
    order: Joi.string().valid('asc', 'desc').optional().default('asc'),
    sort: Joi.string().optional().default('createdAt'),
    startDate: Joi.date().optional(),
    endDate: Joi.date()
      .min(Joi.ref('startDate', { adjust: value => new Date(value) }))
      .optional(),
  },

  async validateParams(schema: Joi.Schema, params: any) {
    try {
      const res = await schema.validateAsync(params, { presence: 'required' })
      return res
    } catch (error: any) {
      const validationError = {
        params,
        errors: error.details.map((detail: any) => detail.message),
      }

      throwExposable(ErrorKeyEnum.badParams, undefined, undefined, {
        validationError,
      })
    }
  },
}

export default ValidationSchema
