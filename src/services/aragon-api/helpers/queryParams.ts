import ValidationSchema from '@helpers/validationSchema'
import type { RouterContext } from '@koa/router'
import type Joi from 'joi'

const REF_KEYS = ['accounts', 'plugins', 'governances']
const PAGINATION_KEYS = ['page', 'pageSize', 'order', 'sort', 'search']

const QueryParams = {
  // `network-0xAddress,...` to the `{ network, address }` list of a POST body. A repeated key stays an array
  // of strings, which the body schema rejects.
  parseRefs(value: unknown) {
    if (typeof value !== 'string') return value
    if (value === '') return []
    return value.split(',').map(part => {
      const ref = part.trim()
      const boundary = ref.lastIndexOf('-')
      return { network: ref.slice(0, boundary), address: ref.slice(boundary + 1) }
    })
  },

  async readQuery(ctx: RouterContext, schema: Joi.ObjectSchema, topLevelKeys: string[] = []) {
    const request: Record<string, any> = {}
    for (const [key, value] of Object.entries(ctx.query)) {
      if (REF_KEYS.includes(key)) {
        request[key] = QueryParams.parseRefs(value)
      } else if (PAGINATION_KEYS.includes(key)) {
        request.pagination = { ...request.pagination, [key]: value }
      } else if (topLevelKeys.includes(key)) {
        request[key] = value
      } else {
        request.filters = { ...request.filters, [key]: value }
      }
    }
    return ValidationSchema.validateParams(schema, request)
  },
}

export default QueryParams
