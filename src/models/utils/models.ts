import { type RouterContext } from '@koa/router'
import { type IPaginatedResult, type IPaginationParams } from '@types'
import dayjs from '@helpers/dayjs'
import { prop } from '@typegoose/typegoose'
import { getAddress } from 'ethers'

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

const ModelUtils = {
  paginateAndSort({ pageSize = 10, page = 1, sort = 'createdAt', order = 'desc' }: IPaginationParams = {}) {
    const paginationAndSorting: any = {}

    // Pagination
    paginationAndSorting.limit = Math.max(1, parseInt(String(pageSize)))
    paginationAndSorting.skip = (page - 1) * paginationAndSorting.limit

    const orderDirection = order === 'desc' ? -1 : 1
    // Sorting
    paginationAndSorting.sort = { [sort]: orderDirection, id: orderDirection }

    return paginationAndSorting
  },

  createFilter(
    { search, startDateProp = 'startDate', endDateProp = 'endDate', startDate, endDate }: IPaginationParams = {},
    searchBy: string[] = [],
  ) {
    const filter: any = {}

    // Search functionality using regex
    if (search && searchBy.length > 0) {
      filter.$or = searchBy.map(field => ({
        [field]: { $regex: `^${search}`, $options: 'i' }, // Starts with search term, case-insensitive
      }))
    }

    // Date range filtering with dayjs and UTC
    if (startDate || endDate) {
      if (startDate) {
        filter[startDateProp] = filter[startDateProp] || {}
        filter[startDateProp]['$gte'] = Number(startDate) // startDate in seconds
      }

      if (endDate) {
        filter[endDateProp] = filter[endDateProp] || {}
        filter[endDateProp]['$lte'] = Number(endDate) // endDate in seconds
      }
    }

    return filter
  },

  parsePaginationParams(
    ctx: RouterContext,
    defaultParams: {
      defaultOrder?: 'asc' | 'desc'
      defaultSort?: string
    } = {},
  ): IPaginationParams {
    const { defaultOrder = 'desc', defaultSort = 'startDate' } = defaultParams
    const { startDateProp, endDateProp } = ctx.query as any

    let searchAddress = ctx.query.search as string
    if (searchAddress?.startsWith('0x')) {
      try {
        searchAddress = getAddress(searchAddress)
      } catch (_) {}
    }

    const pageSize = Number(ctx.query.pageSize ?? 10)

    return {
      search: searchAddress,
      startDateProp,
      endDateProp,
      startDate: ctx.query.startDate ? Number(ctx.query.startDate) : undefined,
      endDate: ctx.query.endDate ? Number(ctx.query.endDate) : undefined,
      pageSize: pageSize > 100 ? 100 : pageSize,
      page: Number(ctx.query.page ?? 1),
      sort: (ctx.query.sort as string) ?? defaultSort,
      order: (ctx.query.order as 'asc' | 'desc') ?? defaultOrder,
    }
  },

  paginateEmptyResponse(pageSize: number): IPaginatedResult<any> {
    return {
      metadata: {
        page: 1,
        pageSize,
        totalRecords: 0,
        totalPages: 1,
      },
      data: [],
    }
  },
}

export default ModelUtils
