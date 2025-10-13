import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IGaugeExtraParams,
  type IGaugeIdParams,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

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

  @prop({ type: () => [String], default: null })
  public links!: string[]

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => Boolean, default: false })
  public isActive!: boolean

  static async create(rawData: Partial<Gauge>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IGaugeIdParams) {
    const entityId = `${params.network}-${params.address}`
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
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IGaugeExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<any>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_, v]) => v !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['network', 'pluginAddress']),
      ...dynamicFilter,
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([
      this.aggregate([{ $match: filter }, { $sort: request.sort }, { $skip: request.skip }, { $limit: request.limit }]),
      this.countDocuments(filter),
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
