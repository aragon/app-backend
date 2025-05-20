import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IDelegateExtraParams,
  type IDelegatesResponse,
  type IExtraQueryData,
  type IMemberTransactionIdParams,
  type IPaginatedResult,
  type IPaginationParams,
  ITransferSide,
  ITransferType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import utils from '@helpers/utils'

const customName = ICollectionNames.MemberTransaction

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
@index({ address: 1, network: 1, transactionHash: 1, blockNumber: 1, tokenAddress: 1 })
@index({ blockNumber: -1, id: -1 })
@index({ tokenAddress: 1 })
export default class MemberTransaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, default: null })
  public delegator!: HexAddress

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public from!: HexAddress

  @prop({ type: () => String, default: null })
  public to!: HexAddress

  @prop({ type: () => String, enum: ITransferSide, required: true })
  public side!: ITransferSide

  @prop({ type: () => String, enum: ITransferType, required: true })
  public type!: ITransferType

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => Number })
  public tokenId!: number

  // historical balance
  @prop({ type: () => String, default: '0' })
  public memberBalance!: string

  // historical voting power
  @prop({ type: () => String, default: '0' })
  public memberVotingPower!: string

  static async create(rawData: Partial<MemberTransaction>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberTransactionIdParams) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.address}`
  }

  static async findExistingLog(params: IMemberTransactionIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum) {
    return await this.findOne({ address, network })
  }

  static async getReceiveDelegationCount(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ): Promise<number> {
    const aggQuery: any = [
      {
        $match: {
          network,
          tokenAddress,
          address: memberAddress,
          type: 'delegate',
        },
      },
      {
        $sort: {
          blockNumber: 1,
          transactionIndex: 1,
          logIndex: 1,
        },
      },
      // 3) Assign a count value: +1 for incoming, -1 for outgoing
      {
        $addFields: {
          delegationCount: {
            $cond: {
              if: { $eq: ['$side', 'incoming'] },
              then: 1,
              else: -1,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          receivedDelegationCount: { $sum: '$delegationCount' },
        },
      },
      {
        $project: {
          _id: 0,
          receivedDelegationCount: { $toInt: '$receivedDelegationCount' },
        },
      },
    ]

    const aggregate = this.aggregate(aggQuery)

    if (tOpts?.session) {
      aggregate.session(tOpts.session)
    }

    const response = await aggregate
    return Number(response[0]?.receivedDelegationCount || 0)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
    extraQueryData = {},
  }: {
    extraParams?: IDelegateExtraParams
    paginationParams?: IPaginationParams
    extraQueryData: IExtraQueryData
  }): Promise<IPaginatedResult<IDelegatesResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'transactionHash',
        'tokenAddress',
        'network',
        'address',
        'from',
        'to',
      ]),
    }

    if (extraQueryData?.memberAddresses?.length! > 0) {
      filter.address = { $in: extraQueryData.memberAddresses }
    }

    if (extraParams.tokenAddress) {
      filter.tokenAddress = extraParams.tokenAddress
    }

    if (extraParams.network) {
      filter.network = extraParams.network
    }

    if (extraParams.memberAddress) {
      filter['$or'] = [{ from: extraParams.memberAddress }, { to: extraParams.memberAddress }]
    }

    const andConditions: any[] = []
    if (extraParams.side) {
      andConditions.push({ side: extraParams.side })
    }
    if (extraParams.type) {
      andConditions.push({ type: extraParams.type })
    }
    if (extraParams.excludeZeroAddress) {
      andConditions.push({
        from: { $ne: utils.zeroAddress },
      })
      andConditions.push({
        to: { $ne: utils.zeroAddress },
      })
    }
    if (andConditions.length) {
      filter['$and'] = andConditions
    }

    const currentPage = request.skip / request.limit + 1

    // TODO: from/to could also be a dao
    const query = [
      AggregationQueryHelper.token({ address: '$tokenAddress', network: '$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        mintableByDao: 1,
      }),
      {
        $addFields: {
          token: { $arrayElemAt: ['$token', 0] },
        },
      },
      AggregationQueryHelper.member(
        {
          memberAddress: '$from',
        },
        'fromInfo',
        {
          address: 1,
          ens: 1,
          avatar: 1,
        },
      ),
      {
        $addFields: {
          from: {
            $cond: {
              if: { $gt: [{ $size: '$fromInfo' }, 0] },
              then: {
                address: { $arrayElemAt: ['$fromInfo.address', 0] },
                ens: { $arrayElemAt: ['$fromInfo.ens', 0] },
                avatar: { $arrayElemAt: ['$fromInfo.avatar', 0] },
              },
              else: {
                address: '$from',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          fromInfo: '$$REMOVE',
        },
      },

      AggregationQueryHelper.member(
        {
          memberAddress: '$to',
        },
        'toInfo',
        {
          address: 1,
          ens: 1,
          avatar: 1,
        },
      ),
      {
        $addFields: {
          to: {
            $cond: {
              if: { $gt: [{ $size: '$toInfo' }, 0] },
              then: {
                address: { $arrayElemAt: ['$toInfo.address', 0] },
                ens: { $arrayElemAt: ['$toInfo.ens', 0] },
                avatar: { $arrayElemAt: ['$toInfo.avatar', 0] },
              },
              else: {
                address: '$to',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          toInfo: '$$REMOVE',
        },
      },
      {
        $project: {
          _id: 0,
          network: 1,
          transactionHash: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          // tokenAddress: 1,
          // address: 1,
          from: 1,
          to: 1,
          side: 1,
          type: 1,
          amount: 1,
          memberBalance: 1,
          memberVotingPower: 1,
          token: 1,
        },
      },
    ]

    const aggQuery = [
      ...(Object.values(filter).length > 0 ? [{ $match: filter }] : []),
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...query,
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([
        ...(Object.values(filter).length > 0 ? [{ $match: filter }] : []),
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

  async update(params: Partial<MemberTransaction>, tOpts?: SaveOptions) {
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
}
