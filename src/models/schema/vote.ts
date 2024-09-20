import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  type IVoteExtraParams,
  type IVoteIdParams,
  type IVoteResponse,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Vote

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
@index({
  network: 1,
  blockNumber: 1,
  daoAddress: 1,
  pluginAddress: 1,
  memberAddress: 1,
})
export default class Vote extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => Number })
  public proposalIndex!: number

  @prop({ type: () => Number })
  public voteOption?: number

  @prop({ type: () => String, default: null })
  public votingPower?: string

  @prop({ type: () => String, default: null })
  public replacedTransactionHash!: HexAddress

  static async create(rawData: Partial<Vote>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'pluginAddress is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVoteIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}`
    return entityId
  }

  static async findExistingLog(params: IVoteIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findVotes({
    proposalIndex,
    pluginAddress,
    network,
  }: {
    proposalIndex: number
    pluginAddress: HexAddress
    network: NetworksEnum
  }) {
    return await this.find({ proposalIndex, pluginAddress, network })
  }

  static async findVoteOnPlugin({
    memberAddress,
    pluginAddress,
    network,
    proposalIndex,
  }: {
    memberAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
    proposalIndex: number
  }) {
    return await this.findOne({ memberAddress, pluginAddress, proposalIndex, network })
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
        ([key, value]) => key !== 'includeInfo' && value !== undefined, // Exclude keys with undefined values
      ),
    )

    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
      ...dynamicFilter,
    }

    const query: any = [
      AggregationQueryHelper.token({ address: '$tokenAddress', network: '$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        type: 1,
      }),
      {
        $addFields: {
          token: { $arrayElemAt: ['$token', 0] },
        },
      },
      AggregationQueryHelper.member(
        {
          memberAddress: '$memberAddress',
        },
        'member',
        {
          address: 1,
          ens: 1,
          avatar: 1,
        },
      ),
      {
        $addFields: {
          member: {
            $cond: {
              if: { $gt: [{ $size: '$member' }, 0] },
              then: {
                address: { $arrayElemAt: ['$member.address', 0] },
                ens: { $arrayElemAt: ['$member.ens', 0] },
                avatar: { $arrayElemAt: ['$member.avatar', 0] },
              },
              else: {
                address: '$memberAddress',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          memberAddress: '$$REMOVE',
        },
      },
    ]

    if (extraParams.includeInfo) {
      query.push(
        {
          $lookup: {
            from: 'Proposal',
            let: { proposalIndex: '$proposalIndex', pluginAddress: '$pluginAddress' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$proposalIndex', '$$proposalIndex'] },
                      { $eq: ['$pluginAddress', '$$pluginAddress'] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  id: 1,
                  transactionHash: 1,
                  proposalIndex: 1,
                  title: 1,
                  description: 1,
                  summary: 1,
                  metadataUri: 1,
                  resources: 1,
                  media: 1,
                },
              },
            ],
            as: 'proposalDetails',
          },
        },
        {
          $addFields: {
            proposal: { $arrayElemAt: ['$proposalDetails', 0] },
          },
        },
      )
    }

    query.push({
      $project: {
        _id: 0,
        transactionHash: 1,
        blockNumber: 1,
        blockTimestamp: 1,
        network: 1,
        member: 1,
        proposalIndex: 1,
        votingPower: 1,
        token: 1,
        proposal: 1,
      },
    })

    const currentPage = request.skip / request.limit + 1
    const aggQuery = [
      { $match: filter },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...query,
      { $sort: request?.sort },
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([{ $match: filter }, ...query, { $count: 'totalRecords' }]),
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
}
