import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IProposalIdParams,
  type IProposalsResponse,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions, Schema } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = ICollectionNames.Proposal

class Resource {
  @prop({ type: () => String, default: null })
  public url!: string

  @prop({ type: () => String, default: null })
  public name!: string
}

class RawAction {
  @prop({ type: () => String, default: null })
  public to!: string

  @prop({ type: () => String, default: null })
  public value!: string

  @prop({ type: () => String, default: null })
  public data!: string
}

class Media {
  @prop({ type: () => String, default: null })
  public header!: string

  @prop({ type: () => String, default: null })
  public logo!: string
}

class Settings {
  @prop({ type: () => String, required: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress // voting token address

  @prop({ type: () => Boolean })
  public onlyListed!: boolean

  @prop({ type: () => Number })
  public minApprovals!: number

  @prop({ type: () => Number })
  public votingMode!: number

  @prop({ type: () => Number })
  public supportThreshold!: number

  @prop({ type: () => Number })
  public minParticipation!: number

  @prop({ type: () => Number })
  public minDuration!: number

  @prop({ type: () => Number })
  public minProposerVotingPower!: number
}

export class ProposalExecuted {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null
}

export class VotesByOption {
  @prop({ type: () => Number, required: true })
  public type!: number

  @prop({ type: () => Number, default: 0 })
  public totalVotes!: number

  @prop({ type: () => String, default: '0' })
  public totalVotingPower!: string
}

export class Metrics {
  @prop({ type: () => Number, default: 0 })
  public totalVotes!: number

  @prop({ type: () => Number, default: 0 })
  public missingVotes!: number

  @prop({ type: () => [VotesByOption], _id: false })
  public votesByOption!: VotesByOption[]
}

class Snapshot {
  @prop({ type: () => String })
  public totalSupply?: string // totalSupply (only needed for token, rm from multisig)

  @prop({ type: () => Number })
  public membersCount?: number // memberCount (only needed for multisig, rm from token)
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
    allowMixed: Severity.ALLOW,
  },
})
@index({
  pluginAddress: 1,
})
export default class Proposal extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public proposalId!: number

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public startDate!: number

  @prop({ type: () => Number, required: true })
  public endDate!: number

  @prop({ type: () => Boolean, default: false })
  public approvalReached!: boolean

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => String, default: null })
  public title!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public summary!: string

  @prop({ type: () => [Resource], _id: false, default: [] })
  public resources?: Resource[]

  @prop({ type: () => Number, default: 0 })
  public allowFailureMap!: number

  @prop({ type: () => ProposalExecuted, _id: false, default: {} })
  public executed!: ProposalExecuted

  @prop({ type: () => [RawAction], _id: false, default: [] })
  public rawActions!: RawAction[]

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public actions!: any[]

  @prop({ type: () => Media, _id: false })
  public media!: Media

  @prop({ type: () => Settings, _id: false, default: {} })
  public settings!: Settings

  @prop({ type: () => Snapshot, _id: false, default: {} })
  public snapshot!: Snapshot

  @prop({ type: () => Metrics, _id: false, default: {} })
  public metrics!: Metrics

  static async create(rawData: Partial<Proposal>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(rawData?.proposalId! >= 0, 'proposalId is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalId: rawData?.proposalId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IProposalIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}-${params.proposalId}`
    return entityId
  }

  static async findExistingLog(params: IProposalIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByProposalId(
    proposalId: number,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ proposalId, pluginAddress, network }, tOpts)
  }

  static async findByTransactionHash(transactionHash: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ transactionHash, network }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IProposalExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IProposalsResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([_, v]) => v !== undefined && _ !== 'daoInfo'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'title',
        'description',
        'summary',
        'creatorAddress',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    const currentPage = request.skip / request.limit + 1

    let query: any = [
      {
        $match: filter,
      },
    ]

    if (extraParams.daoInfo) {
      query = [
        ...query,
        {
          $lookup: {
            from: 'Dao',
            let: { daoAddresses: '$daoAddress' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$address', '$$daoAddresses'],
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
            daoDetails: {
              $arrayElemAt: ['$daoDetails', 0],
            },
          },
        },
      ]
    }

    const aggQuery = [
      ...query,
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      {
        $project: {
          _id: 0,
          __v: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
    ]

    const aggCountQuery = [
      ...query,
      {
        $project: {
          _id: 0,
          __v: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
      { $count: 'totalRecords' },
    ]

    const [data, totalRecords] = await Promise.all([this.aggregate(aggQuery), this.aggregate(aggCountQuery)])
    const _totalRecords = totalRecords?.[0]?.totalRecords ?? 0
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

  async update(params: Partial<Proposal>, tOpts?: SaveOptions) {
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
    const filtered = _.omit(obj, '_id', '__v', 'createdAt', 'updatedAt')
    filtered.settings = _.omit(filtered.settings, 'id', '_id', '__v')
    filtered.media = _.omit(filtered.media, 'id', '_id', '__v')
    return filtered
  }
}
