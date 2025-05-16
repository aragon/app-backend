import { ErrorKeyEnum, NetworksEnum } from '@types'
import { throwExposable } from '@helpers/errors'
import Joi from 'joi'
import { getAddress } from 'ethers'
import dayjs from '@helpers/dayjs'

const ValidationSchema = {
  Joi,
  joiUuid: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
  joiEmail: Joi.string().regex(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/),
  joiAddress: Joi.string()
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
  joiDaoId: Joi.string().custom(value => {
    try {
      const regex = new RegExp(`(${Object.values(NetworksEnum).join('|')})-(0x[0-9a-fA-F]{40})`)
      const match = value.match(regex)

      if (!match || match.length !== 3) {
        return value
      }

      const [, network, address] = match
      const checksumAddress = getAddress(address)

      const formattedValue = `${network}-${checksumAddress}`
      return formattedValue
    } catch (error) {
      return value
    }
  }, 'Dao Id validation'),
  joiTransactionHash: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{64}$/, { name: 'valid transaction hash' }) // Validate format
    .messages({
      'string.pattern.name': '{{#label}} must be a valid transaction hash',
    }),
  joiEns: Joi.string()
    .custom((value, helpers) => {
      // If it's already a valid ENS with .eth extension
      const ensRegex = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.eth$/
      if (ensRegex.test(value)) {
        return value
      }

      // If it's a plain name without extensions, append .dao.eth
      const plainNameRegex = /^[a-zA-Z0-9-]+$/
      if (plainNameRegex.test(value)) {
        return `${value}.dao.eth`
      }

      // Invalid format
      return helpers.error('string.invalid', { value })
    }, 'ENS Validation')
    .messages({
      'string.invalid': '{{#label}} is not a valid ENS',
    }),
  joiSlug: Joi.string()
    .custom((value, helpers) => {
      const regex = /^[a-zA-Z0-9_-]+-\d+$/

      if (!regex.test(value)) {
        return helpers.error('string.invalid', { value })
      }

      const arrayValue = value.split('-')
      if (arrayValue.length !== 2) {
        return helpers.error('string.invalid', { value })
      }

      const index = arrayValue.pop()
      const parsedIndex = Number(index)

      if (!Number.isSafeInteger(parsedIndex) || parsedIndex < 0) {
        return helpers.error('string.invalid', { value })
      }

      return value.toLowerCase()
    }, 'Slug Validation')
    .messages({
      'string.invalid': '{{#label}} is not a valid Slug',
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
    pageSize: Joi.number().integer().min(1).max(300).optional().default(10),
    page: Joi.number().integer().greater(-1).min(1).optional().default(1),
    order: Joi.string().valid('asc', 'desc').optional().default('asc'),
    sort: Joi.string().optional().default('createdAt'),
    startDateProp: Joi.string().optional(),
    endDateProp: Joi.string().optional(),
    startDate: Joi.alternatives()
      .try(Joi.number(), Joi.date())
      .optional()
      .custom((value, helpers) => {
        const timestampInSeconds = typeof value === 'number' ? value : dayjs.utc(value).unix()
        if (isNaN(timestampInSeconds)) {
          return helpers.error('any.invalid')
        }
        return timestampInSeconds
      }, 'startDate convert to seconds'),
    endDate: Joi.alternatives()
      .try(Joi.number(), Joi.date())
      .optional()
      .custom((value, helpers) => {
        const startDate = helpers.state.ancestors[0].startDate
        const endDate = typeof value === 'number' ? value : dayjs.utc(value).unix()
        if (isNaN(endDate)) {
          return helpers.error('any.invalid')
        }
        if (startDate && endDate < startDate) {
          return helpers.error('any.invalid', { message: 'endDate must be greater than or equal to startDate' })
        }
        return endDate
      }, 'endDate convert to seconds'),
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
