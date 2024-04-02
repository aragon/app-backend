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
    }, 'Address Validation'),

  generateJoiDaoPluginPagination: {
    limit: Joi.number().integer().optional().default(10),
    skip: Joi.number().integer().greater(-1).optional().default(0),
    order: Joi.string().valid('asc', 'desc').optional().default('asc'),
    orderProp: Joi.string().optional().default('createdAt'),
  },

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
    limit: Joi.number().integer().optional().default(10),
    skip: Joi.number().integer().greater(-1).optional().default(0),
    order: Joi.string().valid('asc', 'desc').optional().default('asc'),
    orderProp: Joi.string().optional().default('createdAt'),
    fromDate: Joi.date().optional(),
    toDate: Joi.date()
      .min(Joi.ref('fromDate', { adjust: value => new Date(value) }))
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
