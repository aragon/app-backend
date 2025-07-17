import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type ILockIdParams,
  ICollectionNames,
  NetworksEnum,
  type ILockFindMemberParams,
  type IPaginationParams,
  type IPaginatedResult,
  type ILockExtraParams,
  type IMemberLockResponse,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Lock

export class LockWithdraw {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => String, default: '0' })
  public totalLocked!: string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => Number, default: null })
  public epochEndAt!: number | null
}

export class LockExit {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => Number, default: null })
  public exitDateAt!: number | null
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
export default class Lock extends Model {
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

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public escrowAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public exitQueueAddress!: HexAddress

  // erc20 token address
  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  // Nft token address
  @prop({ type: () => String, required: true })
  public nftAddress!: HexAddress

  // ID of the received NFT (emitted by the Deposit event)
  @prop({ type: () => Number, default: null })
  public tokenId!: number

  // Amount of tokens locked (emitted by the Deposit event)
  @prop({ type: () => String, default: '0' })
  public amount!: string

  // Timestamp of the lock epoch (emitted by the Deposit event)
  @prop({ type: () => Number, default: null })
  public epochStartAt!: number

  @prop({ type: () => String, default: '0' })
  public totalLocked!: string

  @prop({ type: () => LockExit, _id: false, default: {} })
  public lockExit!: LockExit

  @prop({ type: () => LockWithdraw, _id: false, default: {} })
  public lockWithdraw!: LockWithdraw

  static async create(rawData: Partial<Lock>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      assert(!!rawData.tokenId, 'tokenId is required')
      assert(!!rawData.escrowAddress, 'escrowAddress is required')
      assert(!!rawData.exitQueueAddress, 'exitQueueAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        tokenAddress: rawData?.tokenAddress!,
        memberAddress: rawData?.memberAddress!,
        tokenId: rawData?.tokenId!,
        escrowAddress: rawData?.escrowAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILockIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.tokenAddress}-${params.escrowAddress}-${params.memberAddress}-${params.tokenId}`
    return entityId
  }

  static async findExistingLog(params: ILockIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findLockMember(params: ILockFindMemberParams, tOpts?: SaveOptions) {
    return await this.findOne(params, null, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: ILockExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMemberLockResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, v]) => v !== undefined && key !== 'onlyActive'),
    )
    const filter = {
      ...dynamicFilter,
    }

    if (extraParams.onlyActive) {
      filter['lockWithdraw.status'] = false
    }

    const currentPage = request.skip / request.limit + 1

    const aggQuery = [
      { $match: filter },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      AggregationQueryHelper.token({ address: '$tokenAddress', network: '$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        totalSupply: 1,
        mintableByDao: 1,
      }),
      AggregationQueryHelper.token({ address: '$nftAddress', network: '$network' }, 'nft', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        totalSupply: 1,
        mintableByDao: 1,
      }),
      {
        $addFields: {
          token: {
            $cond: {
              if: { $ne: ['$tokenAddress', null] },
              then: { $arrayElemAt: ['$token', 0] },
              else: null,
            },
          },
          nft: {
            $cond: {
              if: { $ne: ['$nftAddress', null] },
              then: { $arrayElemAt: ['$nft', 0] },
              else: null,
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          network: 1,
          transactionHash: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          pluginAddress: 1,
          memberAddress: 1,
          token: 1,
          nft: 1,
          tokenAddress: 1, // Keep raw addresses for now
          nftAddress: 1, // Keep raw addresses for now
          tokenId: 1,
          amount: 1,
          epochStartAt: 1,
          lockExit: 1,
          escrowAddress: 1,
          lockWithdraw: {
            status: 1,
            transactionHash: 1,
            blockNumber: 1,
            blockTimestamp: 1,
            amount: 1,
            epochEndAt: 1,
          },
        },
      },
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([{ $match: filter }, { $count: 'totalRecords' }]),
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
      data,
    }
  }

  async update(params: Partial<Lock>, tOpts?: SaveOptions) {
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

  static async getMembersOfVeLockPlugin({
    tokenAddress,
    pluginAddress,
    network,
    settings,
    paginationParams = {},
  }: {
    tokenAddress: HexAddress
    network: NetworksEnum
    pluginAddress: HexAddress
    paginationParams?: IPaginationParams
    settings: {
      currentTime: number
      maxTime: string
      decimals: string
      bias: string
      slope: string
    }
  }): Promise<IPaginatedResult<any>> {
    const request = ModelUtils.paginateAndSort({
      ...paginationParams,
    })
    const currentPage = request.skip / request.limit + 1

    const baseQuery = [
      {
        $match: {
          network,
          tokenAddress,
        },
      },
      {
        $addFields: {
          isActive: { $eq: ['$lockExit.status', false] },
          activeTime: { $subtract: [settings.currentTime, '$epochStartAt'] },
        },
      },
      {
        $addFields: {
          processedTime: { $min: ['$activeTime', settings.maxTime] },
        },
      },
      {
        $addFields: {
          amountDecimal: { $toDecimal: '$amount' },
          slope: { $toDecimal: settings.slope },
          bias: { $toDecimal: settings.bias },
          oneE18: { $toDecimal: settings.decimals },
          processedTimeDecimal: { $toDecimal: '$processedTime' },
        },
      },
      {
        $addFields: {
          slopeComponent: { $multiply: ['$amountDecimal', '$slope', '$processedTimeDecimal'] },
          biasComponent: { $multiply: ['$amountDecimal', '$bias'] },
        },
      },
      {
        $addFields: {
          rawVotingPower: {
            $divide: [{ $add: ['$slopeComponent', '$biasComponent'] }, '$oneE18'],
          },
        },
      },
      {
        $addFields: {
          votingPower: {
            $cond: {
              if: '$isActive',
              then: '$rawVotingPower',
              else: { $toDecimal: '0' },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          memberAddress: 1,
          lockVotingPower: '$votingPower',
          tokenId: 1,
          network: 1,
          tokenAddress: 1,
          amount: 1,
          isActive: 1,
          epochStartAt: 1,
        },
      },
      {
        $lookup: {
          from: ICollectionNames.MemberBalance,
          let: {
            lockTokenId: '$tokenId',
            lockNetwork: '$network',
            lockTokenAddress: '$tokenAddress',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$$lockTokenId', '$tokenIds'] },
                    { $eq: ['$network', '$$lockNetwork'] },
                    { $eq: ['$tokenAddress', '$$lockTokenAddress'] },
                  ],
                },
              },
            },
          ],
          as: 'currentHolder',
        },
      },
      {
        $addFields: {
          currentHolder: {
            $arrayElemAt: ['$currentHolder', 0],
          },
        },
      },
      {
        $match: {
          'currentHolder.address': { $exists: true },
        },
      },
      {
        $group: {
          _id: {
            memberAddress: '$currentHolder.address',
            network: '$network',
            tokenAddress: '$tokenAddress',
          },
          votingPower: { $sum: '$lockVotingPower' },
          locks: {
            $push: {
              tokenId: '$tokenId',
              lockVotingPower: '$lockVotingPower',
            },
          },
          activeLocks: {
            $push: {
              $cond: {
                if: { $gt: ['$lockVotingPower', { $toDecimal: '0' }] },
                then: {
                  tokenId: '$tokenId',
                  amount: '$amount',
                  lockVotingPower: '$lockVotingPower',
                  isActive: '$isActive',
                  epochStartAt: '$epochStartAt',
                },
                else: '$$REMOVE',
              },
            },
          },
          tokenIds: { $addToSet: '$tokenId' },
          totalAmount: { $sum: { $toDecimal: '$amount' } },
          lockCount: { $sum: 1 },
          activeLockCount: {
            $sum: {
              $cond: {
                if: { $gt: ['$lockVotingPower', { $toDecimal: '0' }] },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
    ]

    const dataQuery = [
      ...baseQuery,
      { $sort: request.sort },
      { $skip: request.skip },
      { $limit: request.limit },
      {
        $addFields: {
          votingPowerString: {
            $cond: {
              if: { $eq: ['$votingPower', { $toDecimal: '0' }] },
              then: '0',
              else: {
                $convert: {
                  input: { $round: ['$votingPower', 0] },
                  to: 'string',
                  onError: {
                    $toString: { $round: ['$votingPower', 0] },
                  },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.memberAddress',
          votingPower: '$votingPowerString',
        },
      },
      {
        $lookup: {
          from: 'Member',
          localField: 'address',
          foreignField: 'address',
          as: 'memberInfo',
        },
      },
      {
        $addFields: {
          memberInfo: {
            $arrayElemAt: ['$memberInfo', 0],
          },
        },
      },
      AggregationQueryHelper.memberMetrics(
        {
          memberAddress: '$memberInfo.address',
          network: '$network',
          pluginAddress,
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
          address: '$memberInfo.address',
          ens: '$memberInfo.ens',
          avatar: '$memberInfo.avatar',
          votingPower: 1,
          memberMetrics: {
            $ifNull: [
              {
                $arrayElemAt: ['$memberMetrics', 0],
              },
              {
                lastActivity: null,
                firstActivity: null,
                delegateReceivedCount: 0,
                voteCount: 0,
                proposalCount: 0,
              },
            ],
          },
        },
      },
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(dataQuery),
      this.aggregate([...baseQuery, { $count: 'totalRecords' }]).then(results =>
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
      data,
    }
  }
}
