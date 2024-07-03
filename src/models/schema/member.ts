import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IActiveMemberExtraParams,
  type IMemberExtraParams,
  type IMemberIdParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Member'

export class DaoHistory {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number })
  public fromBlockNumber!: number

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => String })
  public fromTxHash!: HexAddress

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String })
  public votingPower!: string

  @prop({ type: () => String })
  public delegateFromAddress!: HexAddress

  @prop({ type: () => String })
  public delegateToAddress!: HexAddress

  @prop({ type: () => String })
  public tokenBalance!: string

  @prop({ type: () => Number })
  public delegateCount!: number
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'member',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
  'history.pluginAddress': 1,
})
export default class Member extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: HexAddress

  @prop({ type: () => [DaoHistory], _id: false, default: [] })
  public history?: DaoHistory[]

  @prop({ type: () => Number })
  public lastActivity!: number

  @prop({ type: () => Number })
  public firstActivity!: number

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberIdParams) {
    const entityId = `${params.address}`
    return entityId
  }

  static async findExistingLog(params: IMemberIdParams, tOpts?: SaveOptions) {
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
    extraParams?: IMemberExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(
        ([key, value]) =>
          value !== undefined &&
          key !== 'network' &&
          key !== 'daoAddress' &&
          key !== 'pluginAddress' &&
          key !== 'tokenAddress' &&
          key !== 'onlyActive',
      ),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
      ...dynamicFilter,
    }

    // only filter active members in dao
    if (extraParams.onlyActive) {
      filter['$or'] = [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }]
    }

    if (extraParams.daoAddress) {
      filter['history.daoAddress'] = extraParams.daoAddress
    }

    if (extraParams.pluginAddress) {
      filter['history.pluginAddress'] = extraParams.pluginAddress
    }

    if (extraParams.tokenAddress) {
      filter['history.tokenAddress'] = extraParams.tokenAddress
    }

    if (extraParams.network) {
      filter['history.network'] = extraParams.network
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

  static async findActiveWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IActiveMemberExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
    }

    if (extraParams.pluginAddress) {
      filter['history.pluginAddress'] = extraParams.pluginAddress
    }

    if (extraParams.network) {
      filter['history.network'] = extraParams.network
    }

    filter['$or'] = [{ toBlockNumber: null }, { toBlockNumber: { $exists: false } }]

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        {
          $unwind: '$history',
        },
        { $match: filter },
        {
          $project: {
            _id: 0,
            address: '$address',
            ens: '$ens',
            network: '$history.network',
            fromBlockNumber: '$history.fromBlockNumber',
            // toBlockNumber: '$history.toBlockNumber',
            fromTxHash: '$history.fromTxHash',
            // toTxHash: '$history.toTxHash',
            pluginAddress: '$history.pluginAddress',
            pluginSubdomain: '$history.pluginSubdomain',
            tokenAddress: '$history.tokenAddress',
            // daoAddress: '$history.daoAddress',
            votingPower: '$history.votingPower',
            // delegateFromAddress: '$history.delegateFromAddress',
            // delegateToAddress: '$history.delegateToAddress',
          },
        },
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
      ]),
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
      data: data as any,
    }
  }

  async update(params: Partial<Member>, tOpts?: SaveOptions) {
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

  filterMemberOnlyKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', 'id', '__v', 'history', 'createdAt', 'updatedAt')
    return filtered
  }

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    filtered.history = filtered.history.map((h: any) => _.omit(h, '_id', '__v'))
    return filtered
  }
}
