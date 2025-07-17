import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IDaoMemberMappingIdParams,
  type IDaoMemberMappingData,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import { assert } from '@errors'

const customName = ICollectionNames.DaoMemberMapping

// Respect this format
// erc20Gov and VeGove have  tokenAddress
// tokenAddress, memberAddress, network (No pluginAddress)
// admin, multisig
// memberAddress, pluginAddress, network (No tokenAddress)

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
@index({ tokenAddress: 1 })
@index({ memberAddress: 1, pluginAddress: 1 })
@index({ network: 1, pluginAddress: 1 })
@index({ network: 1, pluginAddress: 1, memberAddress: 1, tokenAddress: 1 })
@index({ event: 1, address: 1, tokenAddress: 1, pluginAddress: 1 })
export default class DaoMemberMapping extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: false, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: false, default: null })
  public tokenAddress!: HexAddress

  static async create(rawData: Partial<DaoMemberMapping>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      assert(!!rawData.tokenAddress || !!rawData.pluginAddress, 'tokenAddress or pluginAddress is required')

      rawData.id = this.getEntityId({
        network: rawData?.network!,
        memberAddress: rawData?.memberAddress!,
        tokenOrPluginAddress: rawData?.tokenAddress || rawData?.pluginAddress,
      })
    }

    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoMemberMappingIdParams) {
    return `${params.network}-${params.memberAddress}-${params.tokenOrPluginAddress}`
  }

  static async findExistingLog(params: IDaoMemberMappingIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async pluginCountUniqueMembers(pluginAddress: string, network: NetworksEnum, tOpts?: SaveOptions) {
    const aggregate = this.aggregate([
      {
        $match: {
          pluginAddress,
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

  static async tokenCountUniqueMembers(tokenAddress: string, network: NetworksEnum, tOpts?: SaveOptions) {
    const aggregate = this.aggregate([
      {
        $match: {
          tokenAddress,
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

  static async findMapping(
    { memberAddress, pluginAddress, tokenAddress, network }: IDaoMemberMappingData,
    tOpts?: SaveOptions,
  ) {
    const params: Partial<IDaoMemberMappingData> = {
      memberAddress,
      network,
    }

    if (tokenAddress) {
      params.tokenAddress = tokenAddress
    }

    if (!tokenAddress && pluginAddress) {
      params.pluginAddress = pluginAddress
    }

    if (!tokenAddress && !pluginAddress) {
      return null
    }

    return this.findOne(params, null, tOpts)
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

  // TODO: to pair tokenVoting we need tokenAddress and not pluginAddress, remove also daoAddress
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
    const query: any = [
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

      AggregationQueryHelper.memberMetrics(
        {
          pluginAddress: '$pluginAddress',
          network: '$network',
          memberAddress: '$memberAddress',
        },
        'memberMetrics',
        {
          _id: 0,
          lastActivity: 1,
          firstActivity: 1,
          delegateReceivedCount: 1,
          voteCount: 1,
          proposalCount: 1,
        },
      ),
      {
        $project: {
          _id: 0,
          address: '$memberInfo.address',
          ens: '$memberInfo.ens',
          avatar: '$memberInfo.avatar',
          metrics: '$memberMetrics',
        },
      },
    ]

    const aggQuery = [...query, { $sort: request?.sort }, { $skip: request?.skip }, { $limit: request?.limit }]

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

  async update(params: Partial<DaoMemberMapping>, tOpts?: SaveOptions) {
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

  async removeSelf(tOpts?: SaveOptions) {
    const result = await this.deleteOne({ _id: this._id }, tOpts)
    return result.deletedCount > 0
  }
}
