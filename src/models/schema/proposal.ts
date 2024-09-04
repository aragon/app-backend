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
import { AggregationQueryHelper } from '@models/utils/aggregation'

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
  public header!: string | null

  @prop({ type: () => String, default: null })
  public logo!: string | null
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
  public proposalIndex!: number

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
      assert(rawData?.proposalIndex! >= 0, 'proposalIndex is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalIndex: rawData?.proposalIndex!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IProposalIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}-${params.proposalIndex}`
    return entityId
  }

  static async findExistingLog(params: IProposalIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByProposalIndex(
    proposalIndex: number,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ proposalIndex, pluginAddress, network }, tOpts)
  }

  static async findWithEntityId(id: string) {
    const query = [
      {
        $match: {
          id,
        },
      },
      AggregationQueryHelper.member(
        {
          memberAddress: '$creatorAddress',
        },
        'creator',
      ),
      {
        $addFields: {
          creator: {
            $cond: {
              if: { $gt: [{ $size: '$creator' }, 0] },
              then: {
                address: { $arrayElemAt: ['$creator.address', 0] },
                ens: { $arrayElemAt: ['$creator.ens', 0] },
                avatar: { $arrayElemAt: ['$creator.avatar', 0] },
              },
              else: {
                address: '$creatorAddress',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          creatorAddress: '$$REMOVE',
        },
      },
      AggregationQueryHelper.token({ address: '$settings.tokenAddress', network: '$network' }, 'token', {
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
          'settings.token': {
            $cond: {
              if: { $gt: [{ $size: '$token' }, 0] },
              then: { $arrayElemAt: ['$token', 0] },
              else: null,
            },
          },
        },
      },
      {
        $addFields: {
          token: '$$REMOVE',
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          transactionHash: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          network: 1,
          pluginAddress: 1,
          pluginSubdomain: 1,
          daoAddress: 1,
          proposalIndex: 1,
          creator: 1,
          startDate: 1,
          endDate: 1,
          metadataUri: 1,
          title: 1,
          description: 1,
          summary: 1,
          resources: 1,
          executed: 1,
          actions: 1,
          media: 1,
          settings: {
            $mergeObjects: [
              {
                onlyListed: '$settings.onlyListed',
                minApprovals: '$settings.minApprovals',
                votingMode: '$settings.votingMode',
                supportThreshold: '$settings.supportThreshold',
                minParticipation: '$settings.minParticipation',
                minDuration: '$settings.minDuration',
                minProposerVotingPower: '$settings.minProposerVotingPower',
                token: {
                  $cond: {
                    if: '$settings.token',
                    then: '$settings.token',
                    else: '$$REMOVE',
                  },
                },
              },
              {
                membersCount: '$snapshot.membersCount',
                totalSupply: '$snapshot.totalSupply',
              },
            ],
          },
          metrics: 1,
        },
      },
    ]

    const results = await this.aggregate(query)
    return results?.[0] as IProposalsResponse
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
      Object.entries(extraParams).filter(([key, v]) => v !== undefined && key !== 'daoInfo'),
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

    const query: any = [
      {
        $match: filter,
      },
      AggregationQueryHelper.member(
        {
          memberAddress: '$creatorAddress',
        },
        'creator',
      ),
      {
        $addFields: {
          creator: {
            $cond: {
              if: { $gt: [{ $size: '$creator' }, 0] },
              then: {
                address: { $arrayElemAt: ['$creator.address', 0] },
                ens: { $arrayElemAt: ['$creator.ens', 0] },
                avatar: { $arrayElemAt: ['$creator.avatar', 0] },
              },
              else: {
                address: '$creatorAddress',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          creatorAddress: '$$REMOVE',
        },
      },
      AggregationQueryHelper.token({ address: '$settings.tokenAddress', network: '$network' }, 'token', {
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
          'settings.token': {
            $cond: {
              if: { $gt: [{ $size: '$token' }, 0] },
              then: { $arrayElemAt: ['$token', 0] },
              else: null,
            },
          },
        },
      },
      {
        $addFields: {
          token: '$$REMOVE',
        },
      },
    ]

    if (extraParams.daoInfo) {
      query.push(
        AggregationQueryHelper.dao({ address: '$daoAddress', network: '$network' }, 'dao', {
          _id: 0,
          address: 1,
          name: 1,
          description: 1,
          avatar: 1,
          links: 1,
        }),
      )
    }

    const aggQuery = [
      ...query,
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      {
        $project: {
          _id: 0,
          id: 1,
          transactionHash: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          network: 1,
          pluginAddress: 1,
          pluginSubdomain: 1,
          daoAddress: 1,
          proposalIndex: 1,
          creator: 1,
          startDate: 1,
          endDate: 1,
          metadataUri: 1,
          title: 1,
          description: 1,
          summary: 1,
          resources: 1,
          executed: 1,
          actions: 1,
          media: 1,
          settings: {
            $mergeObjects: [
              {
                onlyListed: '$settings.onlyListed',
                minApprovals: '$settings.minApprovals',
                votingMode: '$settings.votingMode',
                supportThreshold: '$settings.supportThreshold',
                minParticipation: '$settings.minParticipation',
                minDuration: '$settings.minDuration',
                minProposerVotingPower: '$settings.minProposerVotingPower',
                token: {
                  $cond: {
                    if: '$settings.token',
                    then: '$settings.token',
                    else: '$$REMOVE',
                  },
                },
              },
              {
                membersCount: '$snapshot.membersCount',
                totalSupply: '$snapshot.totalSupply',
              },
            ],
          },
          metrics: 1,
          ...(extraParams.daoInfo && { dao: 1 }),
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
}
