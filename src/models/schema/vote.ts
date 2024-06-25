import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IVoteExtraParams,
  type IVoteIdParams,
  type IVoteResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
  ITokenType,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Vote'

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
    collection: 'vote',
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
  pluginAddress: 1,
  memberAddress: 1,
  'token.address': 1,
})
export default class Vote extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => Number })
  public proposalId!: number

  @prop({ type: () => Token, default: null })
  public token?: Token

  @prop({ type: () => Number })
  public voteOption?: number

  @prop({ type: () => String, default: null })
  public votingPower?: string

  static async create(rawData: Partial<Vote>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'pluginAddress is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.proposalId || rawData.proposalId === 0, 'proposalId is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalId: rawData?.proposalId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVoteIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.pluginAddress}-${params.proposalId}`
    return entityId
  }

  static async findExistingLog(params: IVoteIdParams, tOpts?: SaveOptions) {
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
    extraParams?: IVoteExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IVoteResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(
        ([key, value]) => value !== undefined && key !== 'tokenAddress',
      ),
    )

    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
      ...dynamicFilter,
    }

    if (extraParams.tokenAddress) {
      filter['token.address'] = extraParams.tokenAddress
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

  async update(params: Partial<Vote>, tOpts?: SaveOptions) {
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
    filtered.token = _.omit(filtered.token, 'id', '_id', '__v')
    return filtered
  }
}
