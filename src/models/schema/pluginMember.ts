import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IDaoMember,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPluginMemberIdParams,
  NetworksEnum,
} from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.PluginMember

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
@index({ daoAddress: 1 })
@index({ pluginAddress: 1 })
@index({ network: 1 })
@index({ network: 1, pluginAddress: 1, memberAddress: 1 })
export default class PluginMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  static async create(rawData: Partial<PluginMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        memberAddress: rawData.memberAddress!,
        pluginAddress: rawData.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IPluginMemberIdParams) {
    return `${params.network}-${params.memberAddress}-${params.pluginAddress}`
  }

  static async findExistingLog(params: IPluginMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findAllMembersOfPlugin(
    {
      pluginAddress,
      network,
    }: {
      pluginAddress: HexAddress
      network: NetworksEnum
    },
    tOpts?: SaveOptions,
  ) {
    return this.find({ pluginAddress, network }, null, tOpts)
  }

  static async findAllMembersOfDao(
    {
      daoAddress,
      network,
    }: {
      daoAddress: HexAddress
      network: NetworksEnum
    },
    tOpts?: SaveOptions,
  ) {
    return this.find({ daoAddress, network }, null, tOpts)
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
      ...(extraParams?.pluginAddress ? { pluginAddress: extraParams.pluginAddress } : {}),
      ...(extraParams?.daoAddress ? { daoAddress: extraParams.daoAddress } : {}),
      ...(extraParams.network ? { network: extraParams.network } : {}),
    }

    const searchFilter = ModelUtils.createFilter(paginationParams, ['memberInfo.ens', 'memberInfo.address'])

    const currentPage = request.skip / request.limit + 1
    const baseQuery: any = [
      {
        $match: filter,
      },
      {
        $lookup: {
          from: ICollectionNames.Member,
          let: { memberAddress: '$memberAddress' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$address', '$$memberAddress'] },
              },
            },
          ],
          as: 'memberInfo',
        },
      },
      {
        $addFields: {
          memberInfo: { $arrayElemAt: ['$memberInfo', 0] },
        },
      },
      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),

      AggregationQueryHelper.pluginMetrics(
        {
          pluginAddress: '$pluginAddress',
          network: '$network',
          memberAddress: '$memberAddress',
        },
        'memberMetrics',
        {
          voteCount: 1,
          proposalCount: 1,
          firstActivity: 1,
          lastActivity: 1,
        },
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
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      projectStage,
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([...baseQuery, { $count: 'totalRecords' }]).then(results =>
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

  static async countUniqueMembers(daoAddress: string, network: NetworksEnum, tOpts?: SaveOptions) {
    const aggregate = this.aggregate([
      {
        $match: {
          daoAddress,
          network,
        },
      },
      {
        $group: {
          _id: '$memberAddress',
        },
      },
      {
        $count: 'uniqueMemberCount',
      },
    ])

    if (tOpts?.session) {
      aggregate.session(tOpts.session)
    }

    const result = await aggregate
    return result[0]?.uniqueMemberCount || 0
  }

  static async findMapping({ memberAddress, daoAddress, pluginAddress, network }: IDaoMember, tOpts?: SaveOptions) {
    const params: IDaoMember = {
      memberAddress,
      daoAddress,
      pluginAddress,
      network,
    }

    return this.findOne(params, null, tOpts)
  }

  static async findByPluginAndMember(
    network: NetworksEnum,
    pluginAddress: HexAddress,
    memberAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ network, pluginAddress, memberAddress }, null, tOpts)
  }

  static async findByPlugin(network: NetworksEnum, pluginAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, pluginAddress }, null, tOpts)
  }

  static async findByDao(network: NetworksEnum, daoAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, daoAddress }, null, tOpts)
  }

  async update(params: Partial<PluginMember>, tOpts?: SaveOptions) {
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
