import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  ITokenType,
  ITransactionCategory,
  type ITransactionExtraParams,
  type ITransactionIdParams,
  type ITransactionResponse,
  ITransactionType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = ICollectionNames.Transaction

class ERC1155Metadata {
  @prop({ type: () => String, default: null })
  public tokenId!: string

  @prop({ type: () => String, default: null })
  public value!: string
}

class Snapshot {
  // transaction price at specific block
  @prop({ type: () => String, default: null })
  public priceUsd!: string

  @prop({ type: () => Number, default: 0 })
  public priceUpdatedAt!: number
}

class Token {
  @prop({ type: () => String, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITokenType, required: true })
  public type!: ITokenType

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public logo!: string | null

  @prop({ type: () => String, default: null })
  public name!: string | null

  @prop({ type: () => String, default: null, uppercase: true })
  public symbol!: string | null

  @prop({ type: () => Number, default: 18 })
  public decimals!: number

  @prop({ type: () => Snapshot, _id: false, default: {} })
  public snapshot!: Snapshot
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
@index({ id: 1 }, { unique: true })
@index({ fromAddress: 1, toAddress: 1, tokenAddress: 1, daoAddress: 1 })
@index({ blockNumber: -1 })
export default class Transaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => String, default: null })
  public uniqueId!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITransactionType, required: true })
  public type!: ITransactionType

  @prop({ type: () => String, enum: ITransactionCategory, required: true })
  public category!: ITransactionCategory

  @prop({ type: () => String, required: true })
  public fromAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public toAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public value!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenId!: string | null

  @prop({ type: () => String, default: null })
  public erc721TokenId!: string | null

  @prop({ type: () => [ERC1155Metadata], _id: false, default: [] })
  public erc1155Metadata!: ERC1155Metadata[]

  @prop({ type: () => String, default: null })
  public proposalIndex!: string | null

  @prop({ type: () => Token, _id: false, default: null })
  public token?: Token

  @prop({ type: () => String, default: '0' })
  public amountUsd!: string

  static async create(rawData: Partial<Transaction>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.category, 'category is required')
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.uniqueId, 'uniqueId is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')

      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        uniqueId: rawData?.uniqueId!,
        category: rawData?.category!,
        network: rawData?.network!,
        daoAddress: rawData?.daoAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ITransactionIdParams) {
    return `${params.transactionHash}-${params.uniqueId}-${params.category}-${params.daoAddress}-${params.network}`
  }

  static async findExistingLog(params: ITransactionIdParams, tOpts?: SaveOptions) {
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
    extraParams?: ITransactionExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<ITransactionResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && key !== 'tokenAddress'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'transactionHash',
        'fromAddress',
        'toAddress',
        'tokenAddress',
        'daoAddress',
      ]),
      ...dynamicFilter,
      ...(extraParams.tokenAddress && { 'token.address': extraParams.tokenAddress }),
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

  async update(params: Partial<Transaction>, tOpts?: SaveOptions) {
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
    const filtered = _.omit(
      obj,
      '_id',
      'id',
      '__v',
      'isHidden',
      'createdAt',
      'updatedAt',
      'pluginAddress',
      'tokenAddress',
      'createdAt',
      'updatedAt',
    )
    filtered.token = filtered.token ? _.omit(filtered.token, '_id', '__v') : undefined

    if (this.token?.snapshot) {
      filtered.token.historicalPriceUsd = filtered.token.snapshot.priceUsd
      filtered.token.snapshot = undefined
    }

    return filtered
  }
}
