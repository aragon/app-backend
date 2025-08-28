import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginStatus,
  type IProposalExtraParams,
  type IProposalIdParams,
  type IProposalsResponse,
  IReportResultType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions, Schema } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import { Stages } from '@models/schema/setting'
import { Models } from '@dbModels'

const customName = ICollectionNames.Proposal

export class ExternalBodyResult {
  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number, enum: IReportResultType, required: true })
  public resultType!: IReportResultType

  @prop({ type: () => Number, required: true })
  public stage!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number
}

export class SubProposal {
  @prop({ type: () => String })
  public pluginAddress!: HexAddress

  @prop({ type: () => String })
  public proposalIndex?: string

  @prop({ type: () => Number })
  public stageIndex?: number

  @prop({ type: () => String })
  public transactionHash?: string

  @prop({ type: () => Number })
  public blockNumber?: number
}

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

class Simulation {
  @prop({ type: () => String, default: null })
  public url!: string

  @prop({ type: () => Number, default: null })
  public runAt!: number
}

class Settings {
  @prop({ type: () => String })
  public id!: string

  @prop({ type: () => String })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
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

  @prop({ type: () => [Stages], _id: false })
  public stages!: Stages[]
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

export class StageExecuted {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => Number, default: null })
  public stageIndex!: number | null
}

export class VotesByOption {
  @prop({ type: () => Number })
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

class TxInfo {
  @prop({ type: () => String })
  public transactionHash!: string

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null
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
@index({ pluginAddress: 1 })
@index({ 'rawActions.data': 1 })
@index({ transactionHash: 1 })
@index({ network: 1 })
@index({ isSubProposal: 1, 'executed.status': 1 })
@index({ daoAddress: 1, createdAt: -1, transactionIndex: -1 })
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

  @prop({ type: () => String, required: true })
  public proposalIndex!: string

  @prop({ type: () => Number })
  public incrementalId!: number

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public startDate!: number

  @prop({ type: () => Number, required: true })
  public endDate!: number

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

  @prop({ type: () => Boolean, default: false })
  public decoding!: boolean

  @prop({ type: () => Media, _id: false })
  public media!: Media

  @prop({ type: () => Settings, _id: false, default: {} })
  public settings!: Settings

  @prop({ type: () => Snapshot, _id: false, default: {} })
  public snapshot!: Snapshot

  @prop({ type: () => Metrics, _id: false, default: {} })
  public metrics!: Metrics

  // SPP Proposal
  @prop({ type: () => Number })
  public totalStages?: number

  // if SubProposal
  @prop({ type: () => SubProposal, _id: false })
  public parentProposal!: SubProposal

  @prop({ type: () => Boolean, default: false })
  public isSubProposal?: boolean

  @prop({ type: () => Number })
  public stageIndex?: number

  @prop({ type: () => Number })
  public lastStageTransition?: number

  @prop({ type: () => [SubProposal], _id: false })
  public subProposals!: SubProposal[]

  @prop({ type: () => TxInfo, default: null })
  public editedTxInfo!: TxInfo | null

  @prop({ type: () => Boolean, default: false })
  public cancelTxInfo!: TxInfo | null

  @prop({ type: () => [StageExecuted], _id: false })
  public stageExecutions!: StageExecuted[]

  @prop({ type: () => [ExternalBodyResult], _id: false, default: [] })
  public results!: ExternalBodyResult[]

  @prop({ type: () => Simulation, _id: false, default: {} })
  public simulation!: Simulation

  static async create(rawData: Partial<Proposal>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData?.proposalIndex, 'proposalIndex is required')
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
    return `${params.transactionHash}-${params.pluginAddress}-${params.proposalIndex}`
  }

  static async findExistingLog(params: IProposalIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByProposalIndex(
    proposalIndex: string,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ proposalIndex, pluginAddress, network }, null, tOpts)
  }

  static async findLastSavedProposal(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    blockNumber?: number,
    tOpts?: SaveOptions,
  ) {
    return Models.Proposal.findOne({
      pluginAddress,
      network,
      blockNumber: { $lt: blockNumber },
    })
      .sort({ incrementalId: -1 })
      .limit(1)
      .lean()
      .exec(tOpts)
  }

  static async findByProposalIncrementalId(
    incrementalId: string,
    pluginAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ incrementalId, pluginAddress, network }, null, tOpts)
  }

  static async findLatestProposal(pluginAddress: HexAddress, network: NetworksEnum) {
    const query = [
      {
        $match: {
          pluginAddress,
          network,
        },
      },
      {
        $sort: {
          blockNumber: -1 as 1 | -1,
        },
      },
      {
        $limit: 1,
      },
    ]

    const results = await this.aggregate(query)
    return results?.[0]
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
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        mintableByDao: 1,
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
        $lookup: {
          from: 'Plugin',
          let: { pluginAddress: '$pluginAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$$pluginAddress', '$address'] }, { $eq: ['$$network', '$network'] }],
                },
              },
            },
            {
              $project: {
                interfaceType: 1,
              },
            },
          ],
          as: 'pluginInterfaceType',
        },
      },
      {
        $addFields: {
          pluginInterfaceType: {
            $first: '$pluginInterfaceType.interfaceType',
          },
        },
      },

      // populate plugin in settings
      {
        $addFields: {
          allPluginAddresses: {
            $reduce: {
              input: { $ifNull: ['$settings.stages', []] },
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $map: {
                      input: { $ifNull: ['$$this.plugins', []] },
                      as: 'stagePlugin',
                      in: '$$stagePlugin.address',
                    },
                  },
                ],
              },
            },
          },
        },
      },
      AggregationQueryHelper.plugin(
        {
          addresses: '$allPluginAddresses',
          network: '$network',
          status: IPluginStatus.installed,
        },
        'allPluginDocs',
        {
          _id: 0,
          transactionHash: 1,
          blockTimestamp: 1,
          address: 1,
          implementationAddress: 1,
          name: 1,
          description: 1,
          processKey: 1,
          slug: 1,
          links: 1,
          isSupported: 1,
          interfaceType: 1,
          conditionAddress: 1,
          lockManagerAddress: 1,
          // status: 1,
          release: 1,
          build: 1,
          subdomain: 1,
          isProcess: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          enableOfacCheck: 1,
          blockedCountries: 1,
          termsConditionsUrl: 1,
        },
        {
          settings: true,
          token: true,
        },
      ),
      {
        $addFields: {
          'settings.stages': {
            $map: {
              input: { $ifNull: ['$settings.stages', []] },
              as: 'stage',
              in: {
                $mergeObjects: [
                  '$$stage',
                  {
                    plugins: {
                      $map: {
                        input: { $ifNull: ['$$stage.plugins', []] },
                        as: 'stagePlugin',
                        in: {
                          $let: {
                            vars: {
                              // Remove unwanted fields from $$stagePlugin
                              stagePluginClean: {
                                $arrayToObject: {
                                  $filter: {
                                    input: {
                                      $objectToArray: '$$stagePlugin',
                                    },
                                    as: 'field',
                                    cond: {
                                      $not: {
                                        $in: ['$$field.k', ['isManual', 'allowedBody']],
                                      },
                                    },
                                  },
                                },
                              },
                              // Find the matched plugin document
                              matchedPlugin: {
                                $arrayElemAt: [
                                  {
                                    $filter: {
                                      input: '$allPluginDocs',
                                      as: 'pluginDoc',
                                      cond: {
                                        $eq: ['$$pluginDoc.address', '$$stagePlugin.address'],
                                      },
                                    },
                                  },
                                  0,
                                ],
                              },
                            },
                            in: {
                              $mergeObjects: ['$$stagePluginClean', '$$matchedPlugin'],
                            },
                          },
                        },
                      },
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
          allPluginAddresses: 0,
          allPluginDocs: 0,
        },
      },
      AggregationQueryHelper.proposals({
        pluginAddress: '$subProposals.pluginAddress',
        proposalIndex: '$subProposals.proposalIndex',
        network: '$network',
        as: 'subProposals',
      }),
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
          pluginInterfaceType: 1,
          daoAddress: 1,
          proposalIndex: 1,
          incrementalId: 1,
          totalStages: 1,
          parentProposal: 1,
          isSubProposal: 1,
          stageIndex: 1,
          lastStageTransition: 1,
          subProposals: 1,
          creator: 1,
          startDate: 1,
          endDate: 1,
          metadataUri: 1,
          title: 1,
          description: 1,
          summary: 1,
          resources: 1,
          executed: 1,
          hasActions: AggregationQueryHelper.computeHasActions(),
          decoding: 1,
          stageExecutions: 1,
          results: 1,
          media: 1,
          settings: {
            $mergeObjects: [
              '$settings',
              {
                token: {
                  $cond: {
                    if: '$settings.token',
                    then: '$settings.token',
                    else: '$$REMOVE',
                  },
                },
              },
              { historicalMembersCount: '$snapshot.membersCount' },
              { historicalTotalSupply: '$snapshot.totalSupply' },
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
      Object.entries(extraParams).filter(
        ([key, v]) => v !== undefined && key !== 'daoInfo' && key !== 'isExecuted' && key !== 'pluginAddresses',
      ),
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

    if (extraParams.isExecuted) {
      filter['executed.status'] = true
    }

    if (extraParams?.pluginAddresses?.length! > 0) {
      filter.pluginAddress = { $in: extraParams.pluginAddresses }
    }

    const query: any = [
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
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        mintableByDao: 1,
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
        $lookup: {
          from: 'Plugin',
          let: { pluginAddress: '$pluginAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$$pluginAddress', '$address'] }, { $eq: ['$$network', '$network'] }],
                },
              },
            },
            {
              $project: {
                interfaceType: 1,
              },
            },
          ],
          as: 'pluginInterfaceType',
        },
      },
      {
        $addFields: {
          pluginInterfaceType: {
            $first: '$pluginInterfaceType.interfaceType',
          },
        },
      },
      {
        $addFields: {
          allPluginAddresses: {
            $reduce: {
              input: { $ifNull: ['$settings.stages', []] },
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $map: {
                      input: { $ifNull: ['$$this.plugins', []] },
                      as: 'stagePlugin',
                      in: '$$stagePlugin.address',
                    },
                  },
                ],
              },
            },
          },
        },
      },
      AggregationQueryHelper.plugin(
        {
          addresses: '$allPluginAddresses',
          network: '$network',
          status: IPluginStatus.installed,
        },
        'allPluginDocs',
        {
          _id: 0,
          transactionHash: 1,
          blockTimestamp: 1,
          address: 1,
          implementationAddress: 1,
          name: 1,
          description: 1,
          processKey: 1,
          slug: 1,
          links: 1,
          isSupported: 1,
          interfaceType: 1,
          conditionAddress: 1,
          lockManagerAddress: 1,
          // status: 1,
          release: 1,
          build: 1,
          subdomain: 1,
          isProcess: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          enableOfacCheck: 1,
          blockedCountries: 1,
          termsConditionsUrl: 1,
        },
        {
          settings: true,
          token: true,
        },
      ),
      {
        $addFields: {
          'settings.stages': {
            $map: {
              input: { $ifNull: ['$settings.stages', []] },
              as: 'stage',
              in: {
                $mergeObjects: [
                  '$$stage',
                  {
                    plugins: {
                      $map: {
                        input: { $ifNull: ['$$stage.plugins', []] },
                        as: 'stagePlugin',
                        in: {
                          $let: {
                            vars: {
                              // Remove unwanted fields from $$stagePlugin
                              stagePluginClean: {
                                $arrayToObject: {
                                  $filter: {
                                    input: {
                                      $objectToArray: '$$stagePlugin',
                                    },
                                    as: 'field',
                                    cond: {
                                      $not: {
                                        $in: ['$$field.k', ['isManual', 'allowedBody']],
                                      },
                                    },
                                  },
                                },
                              },
                              // Find the matched plugin document
                              matchedPlugin: {
                                $arrayElemAt: [
                                  {
                                    $filter: {
                                      input: '$allPluginDocs',
                                      as: 'pluginDoc',
                                      cond: {
                                        $eq: ['$$pluginDoc.address', '$$stagePlugin.address'],
                                      },
                                    },
                                  },
                                  0,
                                ],
                              },
                            },
                            in: {
                              $mergeObjects: ['$$stagePluginClean', '$$matchedPlugin'],
                            },
                          },
                        },
                      },
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
          allPluginAddresses: 0,
          allPluginDocs: 0,
        },
      },
      AggregationQueryHelper.proposals({
        pluginAddress: '$subProposals.pluginAddress',
        proposalIndex: '$subProposals.proposalIndex',
        network: '$network',
        as: 'subProposals',
      }),
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
      {
        $match: filter,
      },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...query,
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
          pluginInterfaceType: 1,
          daoAddress: 1,
          proposalIndex: 1,
          incrementalId: 1,
          totalStages: 1,
          parentProposal: 1,
          isSubProposal: 1,
          stageIndex: 1,
          lastStageTransition: 1,
          subProposals: 1,
          creator: 1,
          startDate: 1,
          endDate: 1,
          metadataUri: 1,
          title: 1,
          description: 1,
          summary: 1,
          resources: 1,
          executed: 1,
          hasActions: AggregationQueryHelper.computeHasActions(),
          decoding: 1,
          stageExecutions: 1,
          results: 1,
          media: 1,
          settings: {
            $mergeObjects: [
              '$settings',
              {
                token: {
                  $cond: {
                    if: '$settings.token',
                    then: '$settings.token',
                    else: '$$REMOVE',
                  },
                },
              },
              { historicalMembersCount: '$snapshot.membersCount' },
              { historicalTotalSupply: '$snapshot.totalSupply' },
            ],
          },
          metrics: 1,
          ...(extraParams.daoInfo && { dao: 1 }),
        },
      },
    ]

    const aggCountQuery = [
      {
        $match: filter,
      },
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
    return await this.model(customName).findById(this._id, null, tOpts)
  }
}
