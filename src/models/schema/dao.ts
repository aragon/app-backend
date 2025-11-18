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
  IPluginInterfaceType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import { Models } from '@dbModels'
import logger from '@logger'

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
@index({ network: 1, description: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, isActive: 1, isHidden: 1 })
@index({ network: 1, isActive: 1, name: 1, isHidden: 1 })
@index({ network: 1 })
@index({ parentDao: 1, isActive: 1, isHidden: 1 })
@index({ subDaos: 1, isActive: 1, isHidden: 1 })
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

  @prop({ type: () => String, default: null })
  public parentDao?: string | null

  @prop({ type: () => [String], default: [] })
  public subDaos?: string[]

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
        'description',
        'subdomain',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    filter.isHidden = { $ne: true }
    filter.isActive = { $eq: true }

    if (extraQueryData.daoAddresses && extraQueryData.daoAddresses.length > 0) {
      let filteredDaoAddresses = extraQueryData.daoAddresses

      if (extraParams.excludedDao?.daoAddress) {
        const excludedAddress = extraParams.excludedDao.daoAddress
        filteredDaoAddresses = extraQueryData.daoAddresses.filter(address => address !== excludedAddress)
      }

      filter.address = { $in: filteredDaoAddresses }
    }

    if (extraParams.memberAddress && extraQueryData.daoAddresses?.length === 0) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    if (extraParams.networks && extraParams.networks.length > 0) {
      filter.network = { $in: extraParams.networks }
    }

    const aggQuery = [
      { $match: filter },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
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
      {
        $lookup: {
          from: ICollectionNames.Dao,
          let: { parentDaoId: '$parentDao' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$address', '$$parentDaoId'] },
                    { $eq: ['$isActive', true] },
                    { $ne: ['$isHidden', true] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: 1,
                network: 1,
                address: 1,
                name: 1,
                description: 1,
                avatar: 1,
                ens: 1,
                subdomain: 1,
                links: 1,
                metrics: 1,
                transactionHash: 1,
                blockNumber: 1,
                blockTimestamp: 1,
                version: 1,
              },
            },
          ],
          as: 'parentDao',
        },
      },
      {
        $addFields: {
          parentDao: { $arrayElemAt: ['$parentDao', 0] },
        },
      },
      {
        $lookup: {
          from: ICollectionNames.Dao,
          let: { subDaoIds: '$subDaos' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$address', '$$subDaoIds'] },
                    { $eq: ['$isActive', true] },
                    { $ne: ['$isHidden', true] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: 1,
                network: 1,
                address: 1,
                name: 1,
                description: 1,
                avatar: 1,
                ens: 1,
                subdomain: 1,
                links: 1,
                metrics: 1,
                transactionHash: 1,
                blockNumber: 1,
                blockTimestamp: 1,
              },
            },
          ],
          as: 'subDaos',
        },
      },
      {
        $addFields: {
          'metrics.tvlUSD': {
            $add: [
              { $ifNull: ['$metrics.tvlUSD', 0] },
              {
                $reduce: {
                  input: '$subDaos',
                  initialValue: 0,
                  in: {
                    $add: ['$$value', { $ifNull: ['$$this.metrics.tvlUSD', 0] }],
                  },
                },
              },
            ],
          },
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
          parentDao: 1,
          subDaos: 1,
          metrics: 1,
          links: 1,
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

  static async countUniqueMembers(address: HexAddress, network: NetworksEnum, _tOpts?: SaveOptions): Promise<number> {
    try {
      // Step 1: Get all plugins for this DAO
      const plugins = await Models.Plugin.find({
        daoAddress: address,
        network,
        status: IPluginStatus.installed,
        isSupported: true,
      })

      // Step 2: Collect all unique member addresses using Set
      const uniqueMembers = new Set<string>()

      // Step 3: Build queries for all plugins in parallel
      const memberQueries: Promise<string[]>[] = []

      for (const plugin of plugins) {
        if (plugin.interfaceType === IPluginInterfaceType.tokenVoting && plugin.tokenAddress) {
          // Query TokenMember collection - with votingPower filter (consistent with rest of codebase)
          memberQueries.push(
            Models.TokenMember.distinct('memberAddress', {
              tokenAddress: plugin.tokenAddress,
              network,
              votingPower: { $ne: '0' },
            }).catch(error => {
              logger.error('Error counting TokenMember for plugin - requires investigation', {
                plugin: plugin.address,
                interfaceType: plugin.interfaceType,
                daoAddress: address,
                network,
                error,
              })
              return []
            }),
          )

          // Query Lock collection for veGovernance - no votingPower filter needed
          memberQueries.push(
            Models.Lock.distinct('delegateReceiverAddress', {
              tokenAddress: plugin.tokenAddress,
              network,
            }).catch(error => {
              logger.error('Error counting Lock members for plugin - requires investigation', {
                plugin: plugin.address,
                interfaceType: plugin.interfaceType,
                daoAddress: address,
                network,
                error,
              })
              return []
            }),
          )
        } else if (plugin.interfaceType === IPluginInterfaceType.lockToVote && plugin.lockManagerAddress) {
          // Query LockToVoteMember collection - with votingPower filter (consistent with rest of codebase)
          memberQueries.push(
            Models.LockToVoteMember.distinct('memberAddress', {
              lockManagerAddress: plugin.lockManagerAddress,
              network,
              votingPower: { $ne: '0' },
            }).catch(error => {
              logger.error('Error counting LockToVoteMember for plugin - requires investigation', {
                plugin: plugin.address,
                interfaceType: plugin.interfaceType,
                daoAddress: address,
                network,
                error,
              })
              return []
            }),
          )
        } else if ([IPluginInterfaceType.multisig, IPluginInterfaceType.admin].includes(plugin.interfaceType)) {
          // Query PluginMember collection - no votingPower filter needed
          memberQueries.push(
            Models.PluginMember.distinct('memberAddress', {
              pluginAddress: plugin.address,
              network,
            }).catch(error => {
              logger.error('Error counting PluginMember for plugin - requires investigation', {
                plugin: plugin.address,
                interfaceType: plugin.interfaceType,
                daoAddress: address,
                network,
                error,
              })
              return []
            }),
          )
        }
      }

      // Step 4: Execute all queries in parallel
      const allMemberArrays = await Promise.all(memberQueries)

      // Step 5: Combine all results into unique set
      for (const memberArray of allMemberArrays) {
        for (const member of memberArray) {
          uniqueMembers.add(member)
        }
      }

      return uniqueMembers.size
    } catch (error) {
      logger.error('Failed to count unique members for DAO', {
        daoAddress: address,
        network,
        error,
      })
      return 0
    }
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
