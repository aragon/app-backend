import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type ISafeMemberIdParams,
  NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.SafeMember

export const SAFE_MEMBER_INDEX_NAME = 'safe_member_unique'

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({ memberAddress: 1 })
@index({ safeAddress: 1 })
@index({ network: 1 })
@index(
  { network: 1, safeAddress: 1, memberAddress: 1 },
  {
    unique: true,
    name: SAFE_MEMBER_INDEX_NAME,
    collation: { locale: 'en', strength: 2 },
  },
)
export default class SafeMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public safeAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  static async create(rawData: Partial<SafeMember> = {} as Partial<SafeMember>, tOpts?: SaveOptions) {
    assert(!!rawData.network, 'network is required')
    assert(!!rawData.safeAddress, 'safeAddress is required')
    assert(!!rawData.memberAddress, 'memberAddress is required')
    const network = rawData.network!
    const safeAddress = getAddress(rawData.safeAddress!)
    const memberAddress = getAddress(rawData.memberAddress!)
    rawData.safeAddress = safeAddress
    rawData.memberAddress = memberAddress
    rawData.id = this.getEntityId({ network, safeAddress, memberAddress })
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISafeMemberIdParams) {
    return `${params.network}-${getAddress(params.safeAddress)}-${getAddress(params.memberAddress)}`
  }

  static async findAndPaginate({
    paginationParams = {},
    extraParams = {},
  }: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const filter = {
      ...(extraParams?.pluginAddress ? { safeAddress: extraParams.pluginAddress } : {}),
      ...(extraParams.network ? { network: extraParams.network } : {}),
    }
    const searchFilter = ModelUtils.createFilter(paginationParams, ['memberInfo.ens', 'memberInfo.address'])
    const currentPage = request.skip / request.limit + 1
    const baseQuery: any = [
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
        {
          pluginAddress: '$safeAddress',
          network: '$network',
          memberAddress: '$memberAddress',
        },
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
    const aggQuery = [
      ...baseQuery,
      { $sort: request.sort },
      { $skip: request.skip },
      { $limit: request.limit },
      projectStage,
    ]
    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery).allowDiskUse(true),
      this.aggregate([...baseQuery, { $count: 'totalRecords' }])
        .allowDiskUse(true)
        .then(results => (results[0] ? results[0].totalRecords : 0)),
    ])
    const totalPages = Math.ceil(totalRecords / request.limit)
    if (currentPage > totalPages) return ModelUtils.paginateEmptyResponse(request.limit)
    return {
      metadata: {
        page: currentPage,
        pageSize: request.limit,
        totalPages,
        totalRecords,
      },
      data: data as any,
    }
  }
}
