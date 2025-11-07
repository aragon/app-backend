import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IGaugeParams,
  type IGaugeIdParams,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
  type DaoResourceLink,
  IGaugeStatus,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Gauge

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
@index({ daoAddress: 1, pluginAddress: 1, network: 1 })
export default class Gauge extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => Array, default: null })
  public links!: DaoResourceLink[]

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => Boolean, default: false })
  public isActive!: boolean

  static async create(rawData: Partial<Gauge>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IGaugeIdParams) {
    const entityId = `${params.network}-${params.address}-${params.pluginAddress}`
    return entityId
  }

  static async findExistingLog(params: IGaugeIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findWithPagination({
    params = {},
    paginationParams = {},
  }: {
    params?: IGaugeParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<any>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(params).filter(([key, v]) => v !== undefined && !['epochId', 'status'].includes(key)),
    )
    const filter: Record<string, any> = {
      ...ModelUtils.createFilter(paginationParams, ['network', 'pluginAddress']),
      ...dynamicFilter,
    }
    if (params.status) {
      filter.isActive = params.status !== IGaugeStatus.inactive
    }

    const query: any = [
      {
        $match: filter,
      },
      { $sort: request.sort },
      { $skip: request.skip },
      { $limit: request.limit },
      AggregationQueryHelper.gaugeMetrics(
        {
          gaugeAddress: '$address',
          network: '$network',
          epochId: params.epochId,
          pluginAddress: params.pluginAddress,
        },
        'gaugeMetrics',
        {
          totalMemberVoteCount: 1,
          currentEpochVotingPower: 1,
          totalGaugeVotingPower: 1,
          epochId: 1,
        },
      ),
      {
        $addFields: {
          metrics: {
            $cond: {
              if: { $gt: [{ $size: '$gaugeMetrics' }, 0] },
              then: {
                totalMemberVoteCount: { $arrayElemAt: ['$gaugeMetrics.totalMemberVoteCount', 0] },
                currentEpochVotingPower: { $arrayElemAt: ['$gaugeMetrics.currentEpochVotingPower', 0] },
                totalGaugeVotingPower: { $arrayElemAt: ['$gaugeMetrics.totalGaugeVotingPower', 0] },
                epochId: { $arrayElemAt: ['$gaugeMetrics.epochId', 0] },
              },
              else: {
                totalMemberVoteCount: 0,
                currentEpochVotingPower: '0',
                totalGaugeVotingPower: '0',
                epochId: params.epochId,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          network: 1,
          blockNumber: 1,
          transactionHash: 1,
          address: 1,
          pluginAddress: 1,
          creatorAddress: 1,
          name: 1,
          description: 1,
          links: 1,
          avatar: 1,
          isActive: 1,
          metrics: 1,
        },
      },
    ]

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([this.aggregate(query), this.countDocuments(filter)])

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
      data,
    }
  }

  async update(params: Partial<Gauge>, tOpts?: SaveOptions) {
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

  async getPlugin(tOpts?: SaveOptions) {
    return await this.model(ICollectionNames.Plugin).findOne({ address: this.pluginAddress }, tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
