import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type HexAddress,
  ICollectionNames,
  type IMemberBalanceIdParams,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.MemberBalance

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
@index({ address: 1 })
export default class MemberBalance extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: string

  @prop({ type: () => String, required: true })
  public tokenAddress!: string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => [Number], default: [] })
  public tokenIds!: number[]

  @prop({ type: () => String, default: '0' })
  public votingPower!: string

  @prop({ type: () => Number, default: 0 })
  public lastSyncAmountBlockNumber!: number

  @prop({ type: () => Number, default: 0 })
  public lastSyncVotingPowerBlockNumber!: number

  static async create(rawData: Partial<MemberBalance>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'memberAddress is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
        tokenAddress: rawData?.tokenAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberBalanceIdParams) {
    const entityId = `${params.network}-${params.address}-${params.tokenAddress}`
    return entityId
  }

  static async findExistingLog(params: IMemberBalanceIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(tokenAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ tokenAddress, network })
  }

  static async findByAddressAndToken(
    {
      address,
      tokenAddress,
      network,
    }: {
      address: HexAddress
      tokenAddress: HexAddress
      network: NetworksEnum
    },
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ address, tokenAddress, network }, null, tOpts)
  }

  async update(params: Partial<MemberBalance>, tOpts?: SaveOptions) {
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

  async increaseBalance(
    {
      amount,
      blockNumber,
      tokenId,
    }: {
      amount: string
      blockNumber: number
      tokenId?: number
    },
    tOpts?: SaveOptions,
  ) {
    const currentBalance = BigInt(this.amount)
    const increment = BigInt(amount)
    this.amount = (currentBalance + increment).toString()
    this.lastSyncAmountBlockNumber = blockNumber

    if (!this.tokenIds) {
      this.tokenIds = []
    }

    if (tokenId !== undefined && !this.tokenIds.includes(tokenId)) {
      this.tokenIds.push(tokenId)
    }
    return await this.save(tOpts)
  }

  async decreaseBalance(
    {
      amount,
      blockNumber,
      tokenId,
    }: {
      amount: string
      blockNumber: number
      tokenId?: number
    },
    tOpts?: SaveOptions,
  ) {
    const currentBalance = BigInt(this.amount)
    const decrement = BigInt(amount)

    if (currentBalance < decrement) {
      return this
    }

    this.amount = (currentBalance - decrement).toString()
    this.lastSyncAmountBlockNumber = blockNumber

    if (!this.tokenIds) {
      this.tokenIds = []
    }

    if (tokenId !== undefined && this.tokenIds.includes(tokenId)) {
      this.tokenIds = this.tokenIds.filter(id => id !== tokenId)
    }

    return await this.save(tOpts)
  }

  static async findAndPaginate({
    paginationParams = {},
    extraParams = {},
  }: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const filter: any = {}

    if (extraParams?.tokenAddress) {
      filter.tokenAddress = extraParams.tokenAddress
    }

    const searchFilter = ModelUtils.createFilter(paginationParams, ['memberInfo.ens', 'memberInfo.address'])

    const currentPage = request.skip / request.limit + 1

    const query: any = [
      {
        $match: {
          ...filter,
          $or: [{ votingPower: { $gt: '0' } }, { amount: { $gt: '0' } }],
        },
      },
    ]
    const mainQuery = [
      {
        $lookup: {
          from: ICollectionNames.Member,
          localField: 'address',
          foreignField: 'address',
          as: 'memberInfo',
        },
      },
      {
        $unwind: '$memberInfo',
      },
      ...(Object.keys(searchFilter).length ? [{ $match: searchFilter }] : []),
      AggregationQueryHelper.memberMetrics(
        {
          pluginAddress: extraParams?.pluginAddress,
          network: extraParams?.network,
          memberAddress: '$address',
        },
        'memberMetrics',
        {
          _id: 0,
          lastActivity: 1,
          firstActivity: 1,
          delegateReceivedCount: 1,
          voteCount: 1,
          proposalCount: 1,
        },
      ),
      {
        $project: {
          _id: 0,
          address: '$memberInfo.address',
          ens: '$memberInfo.ens',
          avatar: '$memberInfo.avatar',
          tokenBalance: '$amount',
          votingPower: '$votingPower',
          metrics: '$memberMetrics',
        },
      },
    ]

    const aggQuery = [
      ...query,
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...mainQuery,
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery, {
        collation: {
          locale: 'en_US',
          numericOrdering: true,
        },
      }),
      this.aggregate([...query, { $count: 'totalRecords' }]).then(results =>
        results[0] ? results[0].totalRecords : 0,
      ),
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

  async updateVotingPower(amount: string, blockNumber: number, tOpts?: SaveOptions) {
    this.votingPower = amount.toString()
    this.lastSyncVotingPowerBlockNumber = blockNumber
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
