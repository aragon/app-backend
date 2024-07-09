import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IDelegateExtraParams,
  type IDelegateIdParams,
  type IDelegatesResponse,
  type IPaginatedResult,
  type IPaginationParams,
  ITokenType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Delegate'

class Token {
  @prop({ type: () => String, enum: ITokenType, required: true })
  public type!: ITokenType

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public logo!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null, uppercase: true })
  public symbol!: string

  @prop({ type: () => Number, default: 18 })
  public decimals!: number
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'delegate',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  network: 1,
  blockNumber: 1,
  daoAddress: 1,
  tokenAddress: 1,
  pluginAddress: 1,
  fromDelegate: 1,
  toDelegate: 1,
})
export default class Delegate extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String })
  public transactionHash!: HexAddress

  @prop({ type: () => String, required: true })
  public fromDelegate!: HexAddress

  @prop({ type: () => String, required: true })
  public toDelegate!: HexAddress

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => Token, _id: false })
  public token?: Token

  static async create(rawData: Partial<Delegate>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDelegateIdParams) {
    const entityId = `${params.network}-${params.transactionHash}`
    return entityId
  }

  static async findExistingLog(params: IDelegateIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IDelegateExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IDelegatesResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && key !== 'memberAddress'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'transactionHash',
        'daoAddress',
        'pluginAddress',
        'tokenAddress',
        'network',
        'fromDelegate',
        'toDelegate',
      ]),
      ...dynamicFilter,
    }

    if (extraParams.memberAddress) {
      filter['$or'] = [{ fromDelegate: extraParams.memberAddress }, { toDelegate: extraParams.memberAddress }]
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([this.find(filter, null, request), this.countDocuments(filter)])

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

  async update(params: Partial<Delegate>, tOpts?: SaveOptions) {
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

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    filtered.token = filtered.token ? _.omit(filtered.token, '_id', '__v') : undefined
    return filtered
  }
}
