import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type ENS,
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

export class Metrics {
  @prop({ type: () => String })
  public tokenBalance!: string

  @prop({ type: () => Number })
  public delegateReceivedCount!: number

  @prop({ type: () => Number })
  public delegateSentCount!: number

  @prop({ type: () => Number })
  public voteCount!: number

  @prop({ type: () => Number })
  public proposalCount!: number
}

export class EnsMember {
  @prop({ type: () => String })
  public registrationDateTimestamp!: number

  @prop({ type: () => Number })
  public expiredDateTimestamp!: number

  @prop({ type: () => Number })
  public name!: string
}

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

  @prop({ type: () => Metrics, _id: false, default: null })
  public metrics!: Metrics

  @prop({ type: () => Number, default: 0 })
  public fromBlockTimestamp!: number
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

  @prop({ type: () => [EnsMember], default: null })
  public ens?: EnsMember[]

  @prop({ type: () => [DaoHistory], _id: false, default: [] })
  public history?: DaoHistory[]

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

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

  static async findByEns(ens: ENS) {
    return await this.findOne({ ens })
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

    const historyFilter = {
      ...(extraParams.tokenAddress && { 'history.tokenAddress': extraParams.tokenAddress }),
      ...(extraParams.pluginAddress && { 'history.pluginAddress': extraParams.pluginAddress }),
      ...(extraParams.daoAddress && { 'history.daoAddress': extraParams.daoAddress }),
      ...(extraParams.network && { 'history.network': extraParams.network }),
      ...(extraParams.onlyActive && {
        $or: [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }],
      }),
    }

    const currentPage = request.skip / request.limit + 1

    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        { $match: filter },
        { $unwind: '$history' },
        { $match: historyFilter },
        { $sort: request.sort },
        {
          $group: {
            _id: '$_id',
            address: { $first: '$address' },
            ens: { $first: '$ens' },
            history: { $push: '$history' },
          },
        },
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
        {
          $project: {
            _id: 0,
            address: 1,
            ens: 1,
            history: 1,
          },
        },
      ]),
      this.aggregate([
        { $match: filter },
        { $unwind: '$history' },
        { $match: historyFilter },
        { $group: { _id: '$_id' } },
        { $count: 'totalRecords' },
      ]).then(results => (results[0] ? results[0].totalRecords : 0)),
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

  static async findMemberByAddress(
    address: HexAddress,
    extraParams: IMemberExtraParams = {},
  ): Promise<IMembersResponse> {
    const filter = {
      address,
    }

    const member = await this.aggregate([
      { $match: filter },
      {
        $unwind: '$history',
      },
      {
        $match: {
          ...(extraParams.tokenAddress && { 'history.tokenAddress': extraParams.tokenAddress }),
          ...(extraParams.pluginAddress && { 'history.pluginAddress': extraParams.pluginAddress }),
          ...(extraParams.daoAddress && { 'history.daoAddress': extraParams.daoAddress }),
          ...(extraParams.network && { 'history.network': extraParams.network }),
          ...(extraParams.onlyActive && {
            $or: [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }],
          }),
        },
      },
      {
        $group: {
          _id: '$_id',
          address: { $first: '$address' },
          ens: { $first: '$ens' },
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          history: 1,
        },
      },
    ])
    return member?.[0] as IMembersResponse
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

    const currentPage = request.skip / request.limit + 1
    const query = [
      { $match: filter },
      {
        $unwind: '$history',
      },
      {
        $match: {
          ...(extraParams.tokenAddress && { 'history.pluginAddress': extraParams.tokenAddress }),
          ...(extraParams.pluginAddress && { 'history.pluginAddress': extraParams.pluginAddress }),
          ...(extraParams.daoAddress && { 'history.daoAddress': extraParams.daoAddress }),
          ...(extraParams.network && { 'history.network': extraParams.network }),
          $or: [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }],
        },
      },
    ]
    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        ...query,
        {
          $project: {
            _id: 0,
            address: '$address',
            ens: '$ens',
            network: '$history.network',
            fromBlockNumber: '$history.fromBlockNumber',
            fromTxHash: '$history.fromTxHash',
            pluginAddress: '$history.pluginAddress',
            pluginSubdomain: '$history.pluginSubdomain',
            tokenAddress: '$history.tokenAddress',
            daoAddress: '$history.daoAddress',
            votingPower: '$history.votingPower',
          },
        },
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
      ]),
      this.aggregate([...query, { $count: 'totalRecords' }]),
    ])

    const _totalRecords = totalRecords && totalRecords.length === 1 ? totalRecords[0].totalRecords : 0
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

  static async findActiveMember(
    address: HexAddress,
    extraParams: IActiveMemberExtraParams = {},
  ): Promise<IMembersResponse> {
    const filter = {
      address,
    }

    const member = await this.aggregate([
      { $match: filter },
      {
        $unwind: '$history',
      },
      {
        $match: {
          ...(extraParams.pluginAddress && { 'history.pluginAddress': extraParams.pluginAddress }),
          ...(extraParams.daoAddress && { 'history.daoAddress': extraParams.daoAddress }),
          ...(extraParams.network && { 'history.network': extraParams.network }),
          $or: [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }],
        },
      },
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
          daoAddress: '$history.daoAddress',
          votingPower: '$history.votingPower',
          // delegateFromAddress: '$history.delegateFromAddress',
          // delegateToAddress: '$history.delegateToAddress',
        },
      },
    ])
    return member?.[0] as IMembersResponse
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
