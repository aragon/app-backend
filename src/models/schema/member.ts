import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type ENS,
  HexAddress,
  type IActiveMemberExtraParams,
  type IDaoExtraParams,
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
import Utils from '@helpers/utils'

const customName = 'Member'

export class Metrics {
  @prop({ type: () => Number })
  public delegateReceivedCount!: number

  @prop({ type: () => Number })
  public delegateSentCount!: number

  @prop({ type: () => Number })
  public voteCount!: number

  @prop({ type: () => Number })
  public proposalCount!: number
}

export class DaoHistory {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, default: null })
  public fromBlockNumber!: number

  @prop({ type: () => Number, default: null })
  public toBlockNumber!: number

  @prop({ type: () => String, default: null })
  public fromTxHash!: HexAddress

  @prop({ type: () => String, default: null })
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

  @prop({ type: () => String, default: '0' })
  public tokenBalance!: string

  @prop({ type: () => String })
  public delegateFromAddress!: HexAddress

  @prop({ type: () => String })
  public delegateToAddress!: HexAddress

  @prop({ type: () => Metrics, _id: false, default: {} })
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

  @prop({ type: () => String, default: null })
  public ens!: ENS | null

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

  static async findByAddress(address: HexAddress) {
    return await this.findOne({ address })
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
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
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

    const query = [
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
          daos: { $push: '$history' },
        },
      },
      {
        $lookup: {
          from: 'dao',
          let: { daoAddresses: '$daos.daoAddress' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$address', '$$daoAddresses'],
                },
              },
            },
            {
              $project: {
                _id: 0,
                address: 1,
                name: 1,
                description: 1,
                avatar: 1,
                links: 1,
              },
            },
          ],
          as: 'daoDetails',
        },
      },
      {
        $addFields: {
          daos: {
            $map: {
              input: '$daos',
              as: 'dao',
              in: {
                $mergeObjects: [
                  '$$dao',
                  {
                    daoInfo: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$daoDetails',
                            cond: { $eq: ['$$this.address', '$$dao.daoAddress'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          history: '$daos',
        },
      },
    ]

    const member = await this.aggregate(query as any)
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
        $project: {
          address: 1,
          ens: 1,
          history: {
            $filter: {
              input: '$history',
              as: 'item',
              cond: {
                $and: [
                  ...(extraParams.pluginAddress ? [{ $eq: ['$$item.pluginAddress', extraParams.pluginAddress] }] : []),
                  ...(extraParams.tokenAddress ? [{ $eq: ['$$item.tokenAddress', extraParams.tokenAddress] }] : []),
                  ...(extraParams.daoAddress ? [{ $eq: ['$$item.daoAddress', extraParams.daoAddress] }] : []),
                  ...(extraParams.network ? [{ $eq: ['$$item.network', extraParams.network] }] : []),
                  {
                    $or: [{ $eq: ['$$item.toBlockNumber', null] }, { $eq: ['$$item.toBlockNumber', undefined] }],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $match: {
          'history.0': { $exists: true },
        },
      },
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        ...query,
        {
          $project: Utils.hasPropsWithValuesExcludingNetwork(extraParams)
            ? {
                _id: 0,
                address: 1,
                ens: 1,
                network: { $arrayElemAt: ['$history.network', 0] },
                daoAddress: { $arrayElemAt: ['$history.daoAddress', 0] },
                fromBlockNumber: { $arrayElemAt: ['$history.fromBlockNumber', 0] },
                fromTxHash: { $arrayElemAt: ['$history.fromTxHash', 0] },
                pluginAddress: { $arrayElemAt: ['$history.pluginAddress', 0] },
                pluginSubdomain: { $arrayElemAt: ['$history.pluginSubdomain', 0] },
                tokenAddress: { $arrayElemAt: ['$history.tokenAddress', 0] },
                votingPower: { $arrayElemAt: ['$history.votingPower', 0] },
                tokenBalance: { $arrayElemAt: ['$history.tokenBalance', 0] },
                metrics: { $arrayElemAt: ['$history.metrics', 0] },
              }
            : {
                _id: 0,
                address: 1,
                ens: 1,
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
        $project: Utils.hasPropsWithValuesExcludingNetwork(extraParams)
          ? {
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
              tokenBalance: '$history.tokenBalance',
              votingPower: '$history.votingPower',
              metrics: '$history.metrics',
            }
          : {
              _id: 0,
              address: '$address',
              ens: '$ens',
            },
      },
    ])
    return member?.[0] as IMembersResponse
  }

  static async findDaoOfMemberWithPagination(extraParams?: IDaoExtraParams, paginationParams?: IPaginationParams) {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const filter = {
      address: extraParams?.memberAddress,
    }

    const currentPage = request.skip / request.limit + 1

    const query = [
      { $match: filter },
      {
        $unwind: '$history',
      },
      {
        $match: {
          ...(extraParams?.network && { 'history.network': extraParams.network }),
          $or: [{ 'history.toBlockNumber': null }, { 'history.toBlockNumber': { $exists: false } }],
        },
      },
      {
        $lookup: {
          from: 'dao',
          let: { daoAddress: '$history.daoAddress' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$address', '$$daoAddress'] },
              },
            },
            {
              $project: {
                createdAt: 0,
                updatedAt: 0,
                __v: 0,
                hideDao: 0,
                _id: 0,
              },
            },
          ],
          as: 'daoDetails',
        },
      },
      {
        $unwind: '$daoDetails',
      },
      {
        $replaceRoot: { newRoot: '$daoDetails' },
      },
    ]

    const [result, totalRecords] = await Promise.all([
      this.aggregate([...query, { $sort: request?.sort }, { $skip: request?.skip }, { $limit: request?.limit }]),
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
      data: result as any,
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
