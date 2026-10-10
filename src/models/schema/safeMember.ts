import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
import DbTx from '@modules/dbTx'
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
import { type ClientSession, Model, type SaveOptions } from 'mongoose'

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
// One owner row per Safe and owner, whatever casing an event or a seed came in with.
@index(
  { network: 1, safeAddress: 1, memberAddress: 1 },
  { unique: true, name: SAFE_MEMBER_INDEX_NAME, collation: { locale: 'en', strength: 2 } },
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
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.safeAddress, 'safeAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        safeAddress: rawData.safeAddress!,
        memberAddress: rawData.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISafeMemberIdParams) {
    return `${params.network}-${params.safeAddress}-${params.memberAddress}`
  }

  /** Duplicate owner events are harmless outside a transaction; inside one, the caller must handle the abort. */
  static async ensure(
    network: NetworksEnum,
    safeAddress: HexAddress,
    memberAddress: HexAddress,
    session?: ClientSession,
  ) {
    try {
      await this.updateOne(
        { network, safeAddress, memberAddress },
        {
          $setOnInsert: {
            id: this.getEntityId({ network, safeAddress, memberAddress }),
            network,
            safeAddress,
            memberAddress,
          },
        },
        { upsert: true, session },
      )
    } catch (error) {
      if (session || !DbTx.isErrorDuplicateKey(error)) throw error
    }
  }

  static async findOwner(network: NetworksEnum, safeAddress: HexAddress, memberAddress: HexAddress) {
    return await this.findOne({ network, safeAddress, memberAddress })
  }

  /** True when the tuple existed and is now gone. */
  static async removeOwner(network: NetworksEnum, safeAddress: HexAddress, memberAddress: HexAddress) {
    const result = await this.deleteOne({ network, safeAddress, memberAddress })
    return result.deletedCount > 0
  }

  static async hasOwners(network: NetworksEnum, safeAddress: HexAddress) {
    return (await this.exists({ network, safeAddress })) != null
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
