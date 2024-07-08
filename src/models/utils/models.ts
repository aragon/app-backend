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
  paginateAndSort({ pageSize = 10, page = 1, sort = 'desc', order = 'createdAt' }: IPaginationParams = {}) {
    const paginationAndSorting: any = {}

    // Pagination
    paginationAndSorting.limit = Math.max(1, parseInt(String(pageSize)))
    paginationAndSorting.skip = (page - 1) * paginationAndSorting.limit

    // Sorting
    paginationAndSorting.sort = { [order]: sort === 'desc' ? -1 : 1 }

    return paginationAndSorting
  },

  createFilter({ search, startDate, endDate }: IPaginationParams = {}, searchBy: string[] = []) {
    const filter: any = {}

    // Search functionality using regex
    if (search && searchBy.length > 0) {
      filter.$or = searchBy.map(field => ({
        [field]: { $regex: `^${search}`, $options: 'i' }, // Starts with search term, case-insensitive
      }))
    }

    // Date range filtering with dayjs and UTC
    if (startDate) {
      filter.createdAt = filter.createdAt || {}
      filter.createdAt.$gte = dayjs.utc(startDate).startOf('day').toDate()
    }
    if (endDate) {
      filter.createdAt = filter.createdAt || {}
      filter.createdAt.$lte = dayjs.utc(endDate).endOf('day').toDate()
    }

    return filter
  },

  parsePaginationParams(
    ctx: RouterContext,
    defaultParams: { defaultOrder?: string | 'desc'; defaultSort?: 'asc' | 'desc' } = {},
  ): IPaginationParams {
    const { defaultOrder = 'createdAt', defaultSort = 'desc' } = defaultParams

    let searchAddress = ctx.query.search as string
    if (searchAddress?.startsWith('0x')) {
      try {
        searchAddress = getAddress(searchAddress)
      } catch (_) {}
    }

    return {
      search: searchAddress,
      startDate: ctx.query.startDate as string,
      endDate: ctx.query.endDate as string,
      pageSize: Number(ctx.query.pageSize ?? 10),
      page: Number(ctx.query.page ?? 1),
      order: (ctx.query.order as string) ?? defaultSort,
      sort: (ctx.query.sort as 'asc' | 'desc') ?? defaultOrder,
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
