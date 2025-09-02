import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  NetworksEnum,
  type ITokenMemberIdParams,
  type IPaginationParams,
  type IMemberExtraParams,
  type IPaginatedResult,
  type IMembersResponse,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.TokenMember

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
@index({ tokenAddress: 1 })
@index({ network: 1 })
@index({ network: 1, tokenAddress: 1, memberAddress: 1 })
export default class TokenMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public votingPower!: string

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => [String], default: [] })
  public tokenIds!: string[]

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => Number, default: 0 })
  public delegateReceivedCount!: number

  @prop({ type: () => Number, default: 0 })
  public lastVPBlockNumber!: number

  static async create(rawData: Partial<TokenMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        tokenAddress: rawData.tokenAddress!,
        memberAddress: rawData.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ITokenMemberIdParams) {
    return `${params.network}-${params.tokenAddress}-${params.memberAddress}`
  }

  static async findExistingLog(params: ITokenMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByTokenAndMember(
    network: NetworksEnum,
    tokenAddress: HexAddress,
    memberAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ network, tokenAddress, memberAddress }, null, tOpts)
  }

  static async findByToken(network: NetworksEnum, tokenAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, tokenAddress }, null, tOpts)
  }

  static async findByMember(network: NetworksEnum, memberAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, memberAddress }, null, tOpts)
  }

  static async countHoldersWithVotingPower(tokenAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const aggregate = this.aggregate([
      {
        $match: {
          tokenAddress,
          network,
          votingPower: { $ne: '0' },
        },
      },
      {
        $count: 'holderCount',
      },
    ])

    if (tOpts?.session) {
      aggregate.session(tOpts.session)
    }

    const result = await aggregate
    return result[0]?.holderCount || 0
  }

  static async findAndPaginate({
    paginationParams = {},
    extraParams = {},
  }: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const filter: any = {}

    if (extraParams?.tokenAddress) {
      filter.tokenAddress = extraParams.tokenAddress
      filter.network = extraParams.network
    }

    const searchFilter = ModelUtils.createFilter(paginationParams, ['memberInfo.ens', 'memberInfo.address'])

    const currentPage = request.skip / request.limit + 1

    const query: any = [
      {
        $match: {
          ...filter,
          votingPower: { $ne: '0' },
        },
      },
    ]
    const mainQuery = [
      {
        $lookup: {
          from: ICollectionNames.Member,
          localField: 'memberAddress',
          foreignField: 'address',
          as: 'memberInfo',
        },
      },
      {
        $addFields: {
          memberInfo: {
            $arrayElemAt: ['$memberInfo', 0],
          },
        },
      },
      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),
      AggregationQueryHelper.pluginMetrics(
        {
          pluginAddress: extraParams?.pluginAddress,
          network: extraParams?.network!,
          memberAddress: '$memberAddress',
        },
        'pluginMetrics',
        {
          voteCount: 1,
          proposalCount: 1,
          firstActivity: 1,
          lastActivity: 1,
        },
      ),
      {
        $addFields: {
          pluginMetrics: {
            $cond: {
              if: { $gt: [{ $size: '$pluginMetrics' }, 0] },
              then: { $arrayElemAt: ['$pluginMetrics', 0] },
              else: {
                voteCount: 0,
                proposalCount: 0,
                firstActivity: null,
                lastActivity: null,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$memberInfo.address',
          ens: '$memberInfo.ens',
          avatar: '$memberInfo.avatar',
          tokenBalance: null, // TokenMember doesn't have amount field
          votingPower: '$votingPowerString',
          metrics: {
            voteCount: '$pluginMetrics.voteCount',
            proposalCount: '$pluginMetrics.proposalCount',
            firstActivity: '$pluginMetrics.firstActivity',
            lastActivity: '$pluginMetrics.lastActivity',
            delegateReceivedCount: {
              $ifNull: ['$tokenMember.delegateReceivedCount', 0],
            },
          },
        },
      },
    ]

    const aggQuery = [
      ...query,
      {
        $addFields: {
          votingPowerString: '$votingPower',
          votingPower: {
            $toDouble: '$votingPower',
          },
        },
      },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...mainQuery,
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([...query, { $count: 'totalRecords' }]).then(results =>
        results[0] ? results[0].totalRecords : 0,
      ),
    ])
    const totalPages = Math.ceil(totalRecords / request.limit)

    if (currentPage > totalPages) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

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

  async update(params: Partial<TokenMember>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          const parsedObj = this.toObject()

          if (!_.isEqual(parsedObj[key], value)) {
            this[key] = value
          }
        }
      }
    })

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
