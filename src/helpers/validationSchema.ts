// ValidationSchema.ts
import { ErrorKeyEnum, NetworksEnum } from '@types'
import { throwExposable } from '@helpers/errors'
import Joi from 'joi'
import { getAddress } from 'ethers'
import dayjs from '@helpers/dayjs'
import { type RouterContext } from '@koa/router'
import Utils from '@helpers/utils'
import ModelUtils from '@models/utils/models'

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
  joiNetworks: Joi.alternatives().try(
    // handle an actual array
    Joi.array()
      .items(Joi.string().valid(...Object.values(NetworksEnum)))
      .single(),

    // or a CSV string that we split
    Joi.string().custom((value, helpers) => {
      const parts = value.split(',').map((v: string) => v.trim())
      // validate each part
      const invalid = parts.find(p => !Object.values(NetworksEnum).includes(p))
      if (invalid) {
        return helpers.error('any.invalid', { invalid })
      }
      return parts
    }),
  ),
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
    .pattern(/^0x[a-fA-F0-9]{64}$/, { name: 'valid transaction hash' })
    .messages({
      'string.pattern.name': '{{#label}} must be a valid transaction hash',
    }),
  joiEns: Joi.string()
    .custom((value, helpers) => {
      const ensRegex = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.eth$/
      if (!ensRegex.test(value)) {
        return helpers.error('string.invalid', { value })
      }
      return value
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

  async validateRoute(
    ctx: RouterContext,
    config: {
      paginationSort?: string
      params?: Record<string, any>
      extraParams?: Record<string, any>
      pairParams?: Record<string, any>
      customParams?: Record<string, any>
      skipParams?: string[]
      requireRule?: (params: any) => string | null
      schemas: {
        params?: any
        extra?: any
        pair?: any
        custom?: any
      }
    },
  ) {
    // 1. Use the params exactly as provided
    const providedParams = {
      params: config.params || {},
      extraParams: config.extraParams || {},
      pairParams: config.pairParams || {},
      customParams: config.customParams || {},
    }

    // 2. Apply validation rule if provided
    if (config.requireRule) {
      const error = config.requireRule(providedParams)
      if (error) {
        throwExposable(ErrorKeyEnum.badParams, undefined, undefined, {
          validationError: {
            params: { ...providedParams.params, ...providedParams.extraParams, ...providedParams.pairParams },
            errors: [error],
          },
        })
      }
    }

    // 3. Parse pagination
    const paginationParams = ModelUtils.parsePaginationParams(ctx, {
      defaultSort: config.paginationSort,
    })

    // 4. Check for unknown params
    const allKnownParams = {
      ...paginationParams,
      ...providedParams.params,
      ...providedParams.extraParams,
      ...providedParams.pairParams,
      ...providedParams.customParams,
    }

    const anyInvalidParams = Utils.extractAdditionalParams(allKnownParams, ctx.query, config.skipParams || [])

    // 5. Build validation promises with proper tracking
    const validationPromises: Promise<any>[] = []
    const validationMap: Record<string, number> = {}

    // Always validate pagination and invalid params
    validationPromises.push(this.validateParams(Joi.object(this.generateJoiPagination), paginationParams))
    validationMap.pagination = 0

    validationPromises.push(this.validateParams(Joi.object().max(0), anyInvalidParams))
    validationMap.invalid = 1

    // Track which validations we're actually running
    let currentIndex = 2

    if (config.schemas.params && Object.keys(providedParams.params).length > 0) {
      validationPromises.push(this.validateParams(config.schemas.params, providedParams.params))
      validationMap.params = currentIndex++
    }

    if (config.schemas.extra && Object.keys(providedParams.extraParams).length > 0) {
      validationPromises.push(this.validateParams(config.schemas.extra, providedParams.extraParams))
      validationMap.extra = currentIndex++
    }

    if (config.schemas.pair && Object.keys(providedParams.pairParams).length > 0) {
      validationPromises.push(this.validateParams(config.schemas.pair, providedParams.pairParams))
      validationMap.pair = currentIndex++
    }

    if (config.schemas.custom && Object.keys(providedParams.customParams).length > 0) {
      validationPromises.push(this.validateParams(config.schemas.custom, providedParams.customParams))
      validationMap.custom = currentIndex++
    }

    // 6. Execute validations
    const results = await Promise.all(validationPromises)

    // 7. Build response using proper mapping
    return {
      paginationParams: results[validationMap.pagination],
      params: validationMap.params !== undefined ? results[validationMap.params] : providedParams.params,
      extraParams: validationMap.extra !== undefined ? results[validationMap.extra] : providedParams.extraParams,
      pairParams: validationMap.pair !== undefined ? results[validationMap.pair] : providedParams.pairParams,
      customParams: validationMap.custom !== undefined ? results[validationMap.custom] : providedParams.customParams,
    }
  },
}

// Validation rules
export const RequireRules = {
  daoIdOrNetworkWithAddress: (fields?: string[]) => (params: any) => {
    const { extraParams = {}, pairParams = {} } = params
    const hasDaoId = !!pairParams.daoId
    const hasNetwork = !!extraParams.network
    const addressFields = fields || []
    const hasAddress = addressFields.some(field => !!extraParams[field])

    if (!hasDaoId && !(hasNetwork && hasAddress)) {
      return `Either daoId must be provided, or network with at least one address field (${addressFields.join(', ')})`
    }
    return null
  },

  allRequired:
    (...fields: string[]) =>
    (params: any) => {
      const allParams = { ...params.params, ...params.extraParams, ...params.pairParams, ...params.customParams }
      const missing = fields.filter(field => !allParams[field])

      if (missing.length > 0) {
        return `Required fields missing: ${missing.join(', ')}`
      }
      return null
    },

  exclusive: (field1: string, field2: string) => (params: any) => {
    const allParams = { ...params.params, ...params.extraParams, ...params.pairParams }
    if (allParams[field1] && allParams[field2]) {
      return `Cannot provide both ${field1} and ${field2}`
    }
    if (!allParams[field1] && !allParams[field2]) {
      return `Either ${field1} or ${field2} must be provided`
    }
    return null
  },
}

export default ValidationSchema
