import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
import { ICollectionNames, type IMembersResponse, type IPaginatedResult, type IPaginationParams } from '@types'
import type { Model } from 'mongoose'

/**
 * One member listing for every membership collection: join the base Member row, apply the search
 * text, attach the plugin metrics, page. Each collection passes its own filter and the column that
 * holds the plugin address, since a Safe row calls it `safeAddress`.
 */
const MemberPagination = {
  async findAndPaginate(
    model: Pick<Model<any>, 'aggregate'>,
    filter: Record<string, unknown>,
    pluginAddressField: string,
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const searchFilter = ModelUtils.createFilter(paginationParams, ['memberInfo.ens', 'memberInfo.address'])
    const currentPage = request.skip / request.limit + 1

    const baseQuery: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: ICollectionNames.Member,
          let: { memberAddress: '$memberAddress' },
          pipeline: [{ $match: { $expr: { $eq: ['$address', '$$memberAddress'] } } }],
          as: 'memberInfo',
        },
      },
      { $addFields: { memberInfo: { $arrayElemAt: ['$memberInfo', 0] } } },
      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),
      AggregationQueryHelper.pluginMetrics(
        { pluginAddress: `$${pluginAddressField}`, network: '$network', memberAddress: '$memberAddress' },
        'memberMetrics',
        { voteCount: 1, proposalCount: 1, firstActivity: 1, lastActivity: 1 },
      ),
      {
        $addFields: {
          memberMetrics: {
            $cond: {
              if: { $gt: [{ $size: '$memberMetrics' }, 0] },
              then: { $arrayElemAt: ['$memberMetrics', 0] },
              else: null,
            },
          },
        },
      },
    ]

    const projectStage = {
      $project: {
        _id: 0,
        address: '$memberInfo.address',
        ens: '$memberInfo.ens',
        avatar: '$memberInfo.avatar',
        metrics: '$memberMetrics',
        firstActivity: '$memberInfo.firstActivity',
        lastActivity: '$memberInfo.lastActivity',
      },
    }

    const [data, totalRecords] = await Promise.all([
      model
        .aggregate([
          ...baseQuery,
          { $sort: request.sort },
          { $skip: request.skip },
          { $limit: request.limit },
          projectStage,
        ])
        .allowDiskUse(true),
      model
        .aggregate([...baseQuery, { $count: 'totalRecords' }])
        .allowDiskUse(true)
        .then(results => (results[0] ? results[0].totalRecords : 0)),
    ])

    const totalPages = Math.ceil(totalRecords / request.limit)
    if (currentPage > totalPages) return ModelUtils.paginateEmptyResponse(request.limit)

    return {
      metadata: { page: currentPage, pageSize: request.limit, totalPages, totalRecords },
      data: data as IMembersResponse[],
    }
  },
}

export default MemberPagination
