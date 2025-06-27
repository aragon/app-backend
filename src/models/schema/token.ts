import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  type ITokenExtraParams,
  type ITokenIdParams,
  type ITokenResponse,
  ITokenType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils, { utcDateProp } from '@models/utils/models'
import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Token

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
@index({ id: 1 }, { unique: true })
@index({ name: -1 })
@index({ refetch: 1 })
@index({ address: 1, network: 1 })
@index({ lastUpdatedAt: 1, network: 1, skipFetchRate: 1 })
export default class Token extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: ITokenType, required: true })
  public type!: ITokenType

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => Boolean, default: false })
  public mintableByDao!: boolean

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public logo!: string | null

  @prop({ type: () => Boolean, default: false })
  public skipFetchRate!: boolean

  @prop({ type: () => Boolean, default: false })
  public isGovernance!: boolean

  @prop({ type: () => String, default: null })
  public name!: string | null

  @prop({ type: () => String, default: null, uppercase: true })
  public symbol!: string | null

  @prop({ type: () => Number, default: 18 })
  public decimals!: number

  @prop({ type: () => String, default: null })
  public underlying!: HexAddress | null

  @prop({ type: () => Number, default: 0 })
  public holders!: number

  @prop({ type: () => String, default: '0' })
  public totalSupply!: string

  @prop({ type: () => String, default: '0' })
  public priceUsd!: string

  @utcDateProp({ default: null })
  public lastUpdatedAt!: Date

  @prop({ type: () => Boolean, default: false })
  public hasDelegate!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasBalanceOfERC20!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasBalanceOfERC777!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasName!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasSymbol!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasDecimals!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasTotalSupply!: boolean

  @prop({ type: () => Boolean, default: false })
  public hasClockMode!: boolean

  @prop({ type: () => Boolean, default: false })
  public refetch!: boolean

  static async create(rawData: Partial<Token>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({ address: rawData?.address!, network: rawData?.network! })
    }
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static getEntityId(params: ITokenIdParams) {
    const entityId = `${params.address}-${params.network}`
    return entityId
  }

  static async findExistingLog(params: ITokenIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByTokenAddressAndNetwork(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, null, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: ITokenExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<ITokenResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_, v]) => v !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['network', 'address', 'implementationAddress', 'name', 'symbol']),
      ...dynamicFilter,
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

  async update(params: Partial<Token>, tOpts?: SaveOptions) {
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

    return this.save(tOpts)
  }

  async countHolders(tOpts?: SaveOptions) {
    const response = await this.model(customName)
      .aggregate(AggregationQueryHelper.memberCountByToken(this.address, this.network))
      .session(tOpts?.session)

    return response.length > 0 ? response[0].memberCount : 0
  }

  async reload(tOpts?: SaveOptions) {
    return this.model(customName).findById(this._id, tOpts)
  }

  filterKeys(keys: string[] = []) {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', '__v', 'createdAt', 'skipFetchRate', 'updatedAt')
    return keys.length ? _.pick(filtered, keys) : filtered
  }

  pickFields(fields: string[] = []) {
    fields = fields.length === 0 ? ['address', 'name', 'symbol', 'decimals', 'logo', 'type', 'priceUsd'] : fields
    return this.filterKeys(fields)
  }
}
