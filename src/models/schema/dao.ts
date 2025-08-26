import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type DAO_ENS,
  type IDaoExtraParams,
  type IDaoIdParams,
  type IDaoResponse,
  type IExtraQueryData,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginStatus,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Dao

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

class Metrics {
  @prop({ type: () => Number, default: 0 })
  public tvlUSD!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsCreated!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsExecuted!: number

  @prop({ type: () => Number, default: 0 })
  public uniqueVoters!: number

  @prop({ type: () => Number, default: 0 })
  public votes!: number

  @prop({ type: () => Number, default: 0 })
  public members!: number
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
@index({ address: 1, blockNumber: 1, name: 1, creatorAddress: 1, tvlUSD: 1 })
@index({ isHidden: 1, isActive: 1, 'metrics.tvlUSD': -1 })
@index({ address: 1, isActive: 1, isHidden: 1 })
@index({ blockNumber: -1, address: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, isActive: 1, network: 1, isHidden: 1 })
@index({ address: 1, creatorAddress: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, creatorAddress: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, transactionHash: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, implementationAddress: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, implementationAddress: 1, isActive: 1, isHidden: 1 })
@index({ ens: 1, network: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, subdomain: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, subdomain: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, transactionHash: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, name: 1, isActive: 1, isHidden: 1 })
@index({ address: 1, ens: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, isActive: 1, name: 1, isHidden: 1 })
@index({ network: 1 })
export default class Dao extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => Boolean, default: false })
  public isActive!: boolean

  @prop({ type: () => Boolean, default: false })
  public isHidden!: boolean

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens?: DAO_ENS | null

  @prop({ type: () => String, default: null })
  public subdomain!: string

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], _id: false, default: [] })
  public links?: Link[]

  @prop({ type: () => String, default: null })
  public version!: string

  @prop({ type: () => Metrics, _id: false, default: {} })
  public metrics?: Metrics

  static async create(rawData: Partial<Dao>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoIdParams) {
    return `${params.network}-${params.address}`
  }

  static async findExistingLog(params: IDaoIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, null, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
    extraQueryData = {},
  }: {
    extraParams?: IDaoExtraParams
    paginationParams?: IPaginationParams
    extraQueryData: IExtraQueryData
  }): Promise<IPaginatedResult<IDaoResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(
        ([key, value]) =>
          value !== undefined &&
          key !== 'networks' &&
          key !== 'pluginAddress' &&
          key !== 'memberAddress' &&
          key !== 'excludeDaoId' &&
          key !== 'excludedDao',
      ),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'address',
        'implementationAddress',
        'creatorAddress',
        'ens',
        'name',
        'subdomain',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    filter.isHidden = { $ne: true }
    filter.isActive = { $eq: true }

    if (extraQueryData.daoAddresses?.length! > 0) {
      filter.address = { $in: extraQueryData.daoAddresses }
    }

    if (extraParams.memberAddress && extraQueryData.daoAddresses?.length === 0) {
      // no dao for member
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    if (extraParams.networks?.length! > 0) {
      filter.network = { $in: extraParams.networks }
    }

    const aggQuery = [
      { $match: filter },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      AggregationQueryHelper.plugin(
        {
          pluginAddress: extraParams.pluginAddress || undefined,
          daoAddress: '$address',
          network: '$network',
          status: IPluginStatus.installed,
        },
        'plugins',
        {
          _id: 0,
          network: 1,
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
          proposalCreationCondition: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          tokenAddress: 1,
          votingEscrow: 1,
        },
        {
          settings: true,
          token: true,
        },
      ),
      ...(extraParams.pluginAddress
        ? [
            {
              $match: {
                $expr: {
                  $gte: [{ $size: '$plugins' }, 1],
                },
              },
            },
          ]
        : []),

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

      // populate plugin in settings
      {
        $addFields: {
          allPluginAddresses: {
            $reduce: {
              input: '$plugins',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $reduce: {
                      input: { $ifNull: ['$$this.settings.stages', []] },
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
          proposalCreationCondition: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          tokenAddress: 1,
          votingEscrow: 1,
        },
      ),
      {
        $addFields: {
          plugins: {
            $map: {
              input: '$plugins',
              as: 'plugin',
              in: {
                $mergeObjects: [
                  '$$plugin',
                  {
                    settings: {
                      $cond: {
                        if: { $gt: ['$$plugin.settings', null] },
                        then: {
                          $mergeObjects: [
                            '$$plugin.settings',
                            {
                              stages: {
                                $map: {
                                  input: { $ifNull: ['$$plugin.settings.stages', []] },
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
                          ],
                        },
                        else: null,
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

      {
        $project: {
          _id: 0,
          __v: 0,
          isActive: 0,
          isHidden: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
    ]

    const currentPage = request.skip / request.limit + 1

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([{ $match: filter }, { $count: 'totalRecords' }]),
    ])

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

  // INFO: for multiple plugins we cannot extract the voting power and balance of the members
  static async getDaoDetails(address: HexAddress, network: NetworksEnum) {
    const query = [
      {
        $match: {
          address,
          network,
          isHidden: { $ne: true },
          isActive: { $eq: true },
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
      AggregationQueryHelper.plugin(
        {
          daoAddress: '$address',
          network: '$network',
          status: IPluginStatus.installed,
        },
        'plugins',
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
          metadataIpfs: 1,
          // status: 1,
          release: 1,
          build: 1,
          subdomain: 1,
          isProcess: 1,
          proposalCreationCondition: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          tokenAddress: 1,
          votingEscrow: 1,
        },
        { settings: true, token: true },
      ),

      // populate plugin in settings
      {
        $addFields: {
          allPluginAddresses: {
            $reduce: {
              input: '$plugins',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $reduce: {
                      input: { $ifNull: ['$$this.settings.stages', []] },
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
          proposalCreationCondition: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
          tokenAddress: 1,
          votingEscrow: 1,
        },
      ),
      {
        $addFields: {
          plugins: {
            $map: {
              input: '$plugins',
              as: 'plugin',
              in: {
                $mergeObjects: [
                  '$$plugin',
                  {
                    settings: {
                      $cond: {
                        if: { $gt: ['$$plugin.settings', null] },
                        then: {
                          $mergeObjects: [
                            '$$plugin.settings',
                            {
                              stages: {
                                $map: {
                                  input: { $ifNull: ['$$plugin.settings.stages', []] },
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
                          ],
                        },
                        else: null,
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

      {
        $addFields: {
          pluginTokenAddress: { $arrayElemAt: ['$plugin.tokenAddress', 0] },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          isSupported: 1,
          network: 1,
          transactionHash: 1,
          blockNumber: 1,
          blockTimestamp: 1,
          address: 1,
          implementationAddress: 1,
          creator: 1,
          ens: 1,
          subdomain: 1,
          metadataIpfs: 1,
          name: 1,
          description: 1,
          avatar: 1,
          version: 1,
          metrics: 1,
          links: 1,
          plugins: 1,
        },
      },
    ]

    const results = await this.aggregate(query)
    return results?.[0] as IMembersResponse
  }

  async update(params: Partial<Dao>, tOpts?: SaveOptions) {
    Object.entries(params)
      .filter(([key]) => key !== 'id')
      .forEach(([key, value]) => {
        if (this.schema.tree[key]) {
          if (!this.schema.tree[key].required || this.schema.tree[key].required) {
            const parsedObj = this.toObject()
            if (!_.isEqual(parsedObj[key], value)) {
              this[key] = value

              if (key === 'address' || key === 'network') {
                this['id'] = `${this.network}-${this.address}`
              }
            }
          }
        }
      })

    return await this.save(tOpts)
  }

  async updateMetrics(
    metrics: Partial<
      Pick<Metrics, 'proposalsCreated' | 'proposalsExecuted' | 'uniqueVoters' | 'votes' | 'members' | 'tvlUSD'>
    >,
    tOpts?: SaveOptions,
  ): Promise<Dao> {
    if (!this.metrics) {
      this.metrics = new Metrics()
    }

    for (const [key, value] of Object.entries(metrics)) {
      if (key in this.metrics && value !== undefined) {
        ;(this.metrics as any)[key] = value
      }
    }

    return await this.save(tOpts)
  }

  static async countUniqueMembers(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions): Promise<number> {
    const MEMBER_COLLECTION_CONFIG = [
      {
        interfaceTypes: ['tokenVoting'],
        collection: 'TokenMember',
        memberAddressField: 'memberAddress',
        matchField: 'tokenAddress', // Field in a collection to match
        sourceField: '$plugins.tokenAddress', // Source value from plugin
        resultAlias: 'tokenMembers',
      },
      {
        interfaceTypes: ['tokenVoting'],
        collection: 'Lock',
        memberAddressField: 'delegateReceiverAddress',
        matchField: 'tokenAddress', // Field in a collection to match
        sourceField: '$plugins.tokenAddress', // Source value from plugin
        resultAlias: 'veGovernanceMembers',
      },
      {
        interfaceTypes: ['lockToVote'],
        collection: 'LockToVoteMember',
        memberAddressField: 'memberAddress',
        matchField: 'lockManagerAddress', // Field in a collection to match
        sourceField: '$plugins.lockManagerAddress', // Source value from plugin
        resultAlias: 'lockMembers',
      },
    ]

    const pipeline: any[] = [
      {
        $match: {
          address,
          network,
        },
      },
      {
        $lookup: {
          from: 'Plugin',
          let: {
            daoAddress: '$address',
            network: '$network',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$daoAddress', '$$daoAddress'] },
                    { $eq: ['$network', '$$network'] },
                    { $eq: ['$status', 'installed'] },
                    { $eq: ['$isSupported', true] },
                  ],
                },
              },
            },
          ],
          as: 'plugins',
        },
      },
      {
        $unwind: '$plugins',
      },
    ]

    const facetStage: Record<string, any[]> = {}
    MEMBER_COLLECTION_CONFIG.forEach(config => {
      facetStage[config.resultAlias] = [
        {
          $lookup: {
            from: config.collection,
            let: {
              targetValue: config.sourceField,
              network: '$plugins.network',
              interfaceType: '$plugins.interfaceType',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      config.interfaceTypes.length === 1
                        ? { $eq: ['$$interfaceType', config.interfaceTypes[0]] }
                        : { $in: ['$$interfaceType', config.interfaceTypes] },
                      { $eq: [`$${config.matchField}`, '$$targetValue'] },
                      { $eq: ['$network', '$$network'] },
                    ],
                  },
                },
              },
              {
                $project: {
                  memberAddress: `$${config.memberAddressField}`,
                },
              },
            ],
            as: config.resultAlias,
          },
        },
        {
          $project: {
            [config.resultAlias]: 1,
          },
        },
      ]
    })

    pipeline.push({
      $facet: facetStage,
    })

    pipeline.push(
      {
        $addFields: {
          allMembers: {
            $concatArrays: MEMBER_COLLECTION_CONFIG.map(config => {
              return {
                $reduce: {
                  input: `$${config.resultAlias}`,
                  initialValue: [],
                  in: {
                    $concatArrays: ['$$value', `$$this.${config.resultAlias}`],
                  },
                },
              }
            }),
          },
        },
      },
      {
        $unwind: '$allMembers',
      },
      {
        $group: {
          _id: '$allMembers.memberAddress',
        },
      },
      {
        $count: 'uniqueMembersCount',
      },
    )

    const result = await this.aggregate(pipeline, tOpts)
    return result.length > 0 ? result[0].uniqueMembersCount : 0
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
