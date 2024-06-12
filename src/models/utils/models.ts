import _ from 'lodash'
import { type IPaginationParams } from '@types'
import dayjs from '@helpers/dayjs'
import { prop } from '@typegoose/typegoose'

const ModelUtils = {
  parseParams(opts: IPaginationParams, searchBy: string[] = []) {
    const queryParams = _.pick(opts || {}, 'search', 'fromDate', 'toDate')
    const params = _.defaults(queryParams, {
      search: undefined,
      fromDate: undefined,
      toDate: undefined,
    })

    const request: any = {}

    if (params.search) {
      // TODO: maybe we can also search by _id model, first should check if its valid mongoId
      request.$or = searchBy.map(prop => ({
        [prop]: { $regex: `^${params.search}`, $options: 'i' },
      }))
    }

    if (params.fromDate && !params.toDate) {
      request.createdAt = {
        $gte: dayjs.utc(opts.fromDate).startOf('day').toDate(),
      }
    }

    if (opts.toDate && !opts.fromDate) {
      request.createdAt = { $lte: dayjs.utc(opts.toDate).endOf('day').toDate() }
    }

    if (opts.toDate && opts.fromDate) {
      request.createdAt = {
        $gte: dayjs.utc(opts.fromDate).startOf('day').toDate(),
        $lte: dayjs.utc(opts.toDate).endOf('day').toDate(),
      }
    }

    return request
  },

  requestPaginate(opts: IPaginationParams, baseValues: IPaginationParams = {}) {
    const paginateParams = _.pick(opts || {}, 'limit', 'skip', 'orderProp', 'order')
    const params = _.defaults(paginateParams, {
      limit: baseValues.limit ?? 15,
      skip: baseValues.skip ?? 1,
      orderProp: baseValues.orderProp ?? 'createdAt',
      order: baseValues.order ?? 'desc',
    })

    const request: any = {}

    if (params.limit) {
      request.limit = parseInt(String(params.limit))
    } else if (params.limit === 0) {
      request.limit = 0
    }

    if (params.skip) {
      request.skip = parseInt(String(params.limit)) * (parseInt(String(params.skip)) - 1)
    } else if (params.skip === 0) {
      request.skip = 0
    }

    if (params.order || params.orderProp) {
      request.sort = { [params.orderProp]: params.order === 'desc' ? -1 : 1 }
    }

    return request
  },
}

export function utcDateProp(options = {}) {
  return prop({
    ...options,
    type: () => Date,
    // Custom getter
    get: (val: Date | null) => {
      if (val) return dayjs.utc(val).toDate()
      return val
    },
    // Custom setter
    set: (val: Date | string | null) => {
      if (val) return dayjs.utc(val).toDate()
      return val
    },
  })
}

export default ModelUtils
