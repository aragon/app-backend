import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type ISelectorPermissionIdParams,
  NetworksEnum,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { Model, Schema, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = ICollectionNames.SelectorPermission

@modelOptions({ schemaOptions: { _id: false }, options: { allowMixed: Severity.ALLOW } })
export class ActionDecoded {
  @prop({ type: () => String, default: null })
  public functionName!: string | null

  @prop({ type: () => String, default: null })
  public contractName!: string | null

  @prop({ type: () => String, default: null })
  public proxyName!: string | null

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress | null

  @prop({ type: () => Schema.Types.Mixed, default: null })
  public inputs!: any

  @prop({ type: () => String, default: null })
  public notice!: string | null
}

export class Disallowed {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null
}

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
@index({ pluginAddress: 1, daoAddress: 1, conditionAddress: 1 })
@index({ network: 1, transactionHash: 1 })
@index({ pluginAddress: 1, selector: 1 })
export default class SelectorPermission extends Model {
  @prop({ type: () => String, required: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public conditionAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public selector!: string | null // if null, assume native

  @prop({ type: () => String, required: true })
  public target!: HexAddress

  @prop({ type: () => Boolean, default: true })
  public isAllowed!: boolean

  @prop({ type: () => Disallowed, default: {}, _id: false })
  public disallowed!: Disallowed

  @prop({ type: () => ActionDecoded, default: null })
  public decoded!: ActionDecoded

  static async create(rawData: Partial<SelectorPermission>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.conditionAddress, 'conditionAddress is required')

      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        conditionAddress: rawData?.conditionAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISelectorPermissionIdParams) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.conditionAddress}`
  }

  static async findExistingLog(params: ISelectorPermissionIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByPluginAndDao(
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return this.find({ pluginAddress, daoAddress, network }, null, tOpts)
  }

  static async findAllowedSelectors(
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    conditionAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return this.find(
      {
        pluginAddress,
        daoAddress,
        conditionAddress,
        network,
        isAllowed: true,
      },
      null,
      tOpts,
    )
  }

  static async findBySelector(
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    conditionAddress: HexAddress,
    selector: string | null,
    target: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return this.findOne(
      {
        pluginAddress,
        daoAddress,
        conditionAddress,
        selector,
        target,
        network,
        isAllowed: true,
      },
      null,
      tOpts,
    )
  }

  async update(params: Partial<SelectorPermission>, tOpts?: SaveOptions) {
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

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: any
    paginationParams?: IPaginationParams
    pairParams?: any
  }): Promise<IPaginatedResult<any>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_key, v]) => v !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['pluginAddress', 'daoAddress', 'conditionAddress']),
      ...dynamicFilter,
      isAllowed: true,
    }

    const currentPage = request.skip / request.limit + 1

    const aggQuery = [
      { $match: filter },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      {
        $project: {
          _id: 0,
          id: 1,
          transactionHash: 1,
          transactionIndex: 1,
          logIndex: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          network: 1,
          pluginAddress: 1,
          daoAddress: 1,
          conditionAddress: 1,
          selector: 1,
          target: 1,
          isAllowed: 1,
          disallowed: 1,
          decoded: 1,
        },
      },
    ]

    const aggCountQuery = [{ $match: filter }, { $count: 'totalRecords' }]

    const [data, totalRecords] = await Promise.all([this.aggregate(aggQuery), this.aggregate(aggCountQuery)])
    const _totalRecords = totalRecords?.[0]?.totalRecords ?? 0
    const totalPages = Math.ceil(_totalRecords / request.limit)

    if (currentPage > totalPages) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    return {
      metadata: {
        page: currentPage,
        pageSize: request.limit,
        totalPages,
        totalRecords: _totalRecords,
      },
      data: data as any,
    }
  }
}
