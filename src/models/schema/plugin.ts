import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IGetPoliciesByDaoParams,
  type IPluginIdParams,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Plugin

export class VotingEscrow {
  @prop({ type: () => String, default: null })
  public curveAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public exitQueueAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public escrowAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public clockAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public nftLockAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public underlying!: HexAddress
}

export class SubPlugin {
  @prop({ type: () => [String], default: [] })
  public addresses!: HexAddress[]

  @prop({ type: () => Number })
  public stageIndex?: number
}

export class PluginPermission {
  @prop({ type: () => Number, default: null })
  public operation!: number

  @prop({ type: () => String, default: null })
  public where!: string

  @prop({ type: () => String, default: null })
  public who!: string

  @prop({ type: () => String, default: null })
  public condition!: string

  @prop({ type: () => String, default: null })
  public permissionId!: string
}

export class PluginUninstalled {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null
}

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
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
@index({ network: 1, address: 1, daoAddress: 1, tokenAddress: 1 })
@index({ network: 1, tokenAddress: 1 })
@index({ network: 1, status: 1, interfaceType: 1 })
@index({ daoAddress: 1, network: 1, status: 1, isSupported: 1, interfaceType: 1 })
@index({ address: 1 })
@index({ network: 1, 'votingEscrow.escrowAddress': 1 })
@index({ conditionAddress: 1, network: 1, status: 1 })
@index({ network: 1, 'votingEscrow.exitQueueAddress': 1 })
export default class Plugin extends Model {
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
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress?: HexAddress

  @prop({ type: () => String, enum: IPluginInterfaceType, required: true })
  public interfaceType!: IPluginInterfaceType

  @prop({ type: () => String, enum: IPluginStatus, required: true })
  public status!: IPluginStatus

  @prop({ type: () => Boolean, default: false })
  public isSupported!: boolean

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress // voting token address

  @prop({ type: () => String, default: null })
  public pluginSetupRepoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public sender!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => String, default: null })
  public subdomain!: string

  @prop({ type: () => [PluginPermission], _id: false, default: [] })
  public permissions!: PluginPermission[]

  @prop({ type: () => PluginUninstalled, _id: false, default: {} })
  public uninstalled!: PluginUninstalled

  @prop({ type: () => Boolean, default: false })
  public hasTarget!: boolean

  // Flags
  @prop({ type: () => Boolean, default: false })
  public isProcess?: boolean

  @prop({ type: () => Boolean, default: false })
  public isBody?: boolean

  @prop({ type: () => Boolean, default: false })
  public isSubPlugin?: boolean

  @prop({ type: () => Boolean, default: false })
  public isPolicy?: boolean

  // SPP plugin
  @prop({ type: () => Number })
  public totalStages?: number

  @prop({ type: () => [SubPlugin], _id: false })
  public subPlugins!: SubPlugin[]

  // SPP sub-plugins
  @prop({ type: () => Number })
  public stageIndex?: number

  @prop({ type: () => String })
  public parentPlugin?: HexAddress

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public processKey!: string

  @prop({ type: () => [Link], _id: false, default: [] })
  public links?: Link[]

  @prop({ type: () => VotingEscrow, _id: false, default: null })
  public votingEscrow?: VotingEscrow

  @prop({ type: () => String, default: null })
  public conditionAddress?: HexAddress

  @prop({ type: () => String, default: null })
  public lockManagerAddress?: HexAddress

  @prop({ type: () => String, default: null })
  public proposalCreationConditionAddress?: HexAddress

  @prop({ type: () => Boolean, default: null })
  public enableOfacCheck?: boolean

  @prop({ type: () => [String], default: [] })
  public blockedCountries?: string[]

  @prop({ type: () => String, default: null })
  public termsConditionsUrl?: string

  static async create(rawData: Partial<Plugin>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        address: rawData?.address as any,
        network: rawData?.network!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IPluginIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.address}`
    return entityId
  }

  static async findExistingLog(params: IPluginIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const params: any = { address, isSupported: true }
    if (network) {
      params.network = network
    }
    const supportedPlugin = await this.findOne(params, null, tOpts)
    if (supportedPlugin) {
      return supportedPlugin
    }
    return await this.findOne({ address, network, isSupported: false }, null, tOpts)
  }

  static async findByTokenAddress(tokenAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ tokenAddress, network }, null, tOpts)
  }

  static async findAllByTokenAddress(tokenAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.find({ tokenAddress, network }, null, tOpts)
  }

  static async findActivePluginByTokenAddress(tokenAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({
      tokenAddress,
      network,
      status: IPluginStatus.installed,
    })
      .sort({ blockNumber: -1 })
      .exec()
  }

  static async findActivePluginsByDaoAddress(daoAddress: HexAddress, network: NetworksEnum) {
    return await this.find({
      daoAddress,
      network,
      status: IPluginStatus.installed,
    }).exec()
  }

  static async getPluginIdBySlugAndDao(slug: string, daoAddress: HexAddress, network: NetworksEnum) {
    const plugin: any = await this.aggregate([
      {
        $match: {
          daoAddress,
          network,
          isSupported: true,
          isPolicy: { $ne: true },
        },
      },
      {
        $lookup: {
          from: ICollectionNames.PluginSlug,
          let: {
            daoAddress: '$daoAddress',
            network: '$network',
            address: '$address',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$daoAddress', '$$daoAddress'] },
                    { $eq: ['$network', '$$network'] },
                    { $eq: ['$pluginAddress', '$$address'] },
                    { $eq: ['$slug', slug] },
                  ],
                },
              },
            },
          ],
          as: 'matchedSlugs',
        },
      },
      {
        $unwind: '$matchedSlugs',
      },
      {
        $project: {
          _id: 0,
          id: 1,
        },
      },
    ])

    return plugin?.[0]?.id ?? undefined
  }

  static async findByDaoWithFilters({
    daoAddress,
    network,
    interfaceType,
    status,
    isProcess,
    isSupported,
  }: {
    daoAddress: HexAddress
    network: NetworksEnum
    interfaceType?: IPluginInterfaceType
    status?: IPluginStatus
    isProcess?: boolean
    isSupported?: boolean
  }) {
    const filter: any = {
      daoAddress,
      network,
      isPolicy: { $ne: true },
    }

    if (interfaceType) {
      filter.interfaceType = interfaceType
    }

    if (status) {
      filter.status = status
    }

    if (isProcess !== undefined) {
      filter.isProcess = isProcess
    }

    if (isSupported !== undefined) {
      filter.isSupported = isSupported
    }

    filter.interfaceType = {
      $nin: [IPluginInterfaceType.router, IPluginInterfaceType.claimer],
    }

    return await this.find(filter).sort({ blockNumber: -1 }).lean().exec()
  }

  static async findByDaoAddressesWithDetails({
    daoAddresses,
    network,
  }: {
    daoAddresses: HexAddress[]
    network: NetworksEnum
  }) {
    const aggQuery: any = [
      {
        $match: {
          daoAddress: { $in: daoAddresses },
          network,
          status: IPluginStatus.installed,
          isPolicy: { $ne: true },
        },
      },
      {
        $sort: { blockNumber: -1 as const },
      },
      AggregationQueryHelper.setting(
        {
          pluginAddress: '$address',
          network: '$network',
        },
        'settings',
        {
          _id: 0,
          onlyListed: 1,
          minApprovals: 1,
          votingMode: 1,
          supportThreshold: 1,
          minParticipation: 1,
          minDuration: 1,
          minProposerVotingPower: 1,
          stages: 1,
          votingEscrow: 1,
        },
      ),
      AggregationQueryHelper.token(
        {
          address: '$tokenAddress',
          network: '$network',
        },
        'token',
        {
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
        },
      ),
      {
        $addFields: {
          settings: {
            $mergeObjects: [{ $arrayElemAt: ['$settings', 0] }, { token: { $arrayElemAt: ['$token', 0] } }],
          },
        },
      },
      AggregationQueryHelper.pluginSlug(
        {
          pluginAddress: '$address',
          network: '$network',
        },
        'pluginSlug',
      ),
      {
        $addFields: {
          slug: { $arrayElemAt: ['$pluginSlug.slug', 0] },
        },
      },
      {
        $project: {
          _id: 0,
          __v: 0,
          permissions: 0,
          uninstalled: 0,
          hasTarget: 0,
          sender: 0,
          token: 0,
          pluginSlug: 0,
        },
      },
      {
        $group: {
          _id: null,
          plugins: { $push: '$$ROOT' },
        },
      },
      ...AggregationQueryHelper.pluginDetailsWithNestedSubPlugins(network),
    ]

    const result = await this.aggregate(aggQuery)
    return result?.[0]?.plugins || []
  }

  /**
   * Find all policy plugins (router/claimer) for a DAO with their settings
   * Returns plugin structure with strategy field populated from settings
   */
  static async findPoliciesByDao({ daoAddress, daoAddresses, network }: IGetPoliciesByDaoParams) {
    const matchFilter: any = {
      network,
      interfaceType: { $in: [IPluginInterfaceType.router, IPluginInterfaceType.claimer] },
      isPolicy: true,
      status: IPluginStatus.installed,
    }

    if (daoAddresses?.length) {
      matchFilter.daoAddress = { $in: daoAddresses }
    } else {
      matchFilter.daoAddress = daoAddress
    }

    const aggQuery: any = [
      {
        $match: matchFilter,
      },
      {
        $sort: { blockNumber: -1 as const },
      },
      AggregationQueryHelper.setting(
        {
          pluginAddress: '$address',
          network: '$network',
        },
        'settings',
        {
          _id: 0,
          policy: 1,
        },
      ),
      AggregationQueryHelper.pluginSlug(
        {
          pluginAddress: '$address',
          network: '$network',
        },
        'pluginSlug',
      ),
      {
        $addFields: {
          policyData: { $arrayElemAt: ['$settings.policy', 0] },
          policyKey: '$processKey',
          slug: { $arrayElemAt: ['$pluginSlug.slug', 0] },
        },
      },
      AggregationQueryHelper.token(
        {
          address: '$policyData.source.tokenAddress',
          network: '$network',
        },
        'sourceToken',
        {
          _id: 0,
          address: 1,
          symbol: 1,
          name: 1,
          decimals: 1,
          logo: 1,
        },
      ),
      AggregationQueryHelper.token(
        {
          address: '$policyData.swap.targetTokenAddress',
          network: '$network',
        },
        'swapTargetToken',
        {
          _id: 0,
          address: 1,
          symbol: 1,
          name: 1,
          decimals: 1,
          logo: 1,
        },
      ),
      {
        $addFields: {
          strategy: {
            policyId: '$policyData.policyId',
            type: '$policyData.strategyType',
            model: {
              $cond: {
                if: { $ifNull: ['$policyData.model.address', false] },
                then: {
                  type: '$policyData.model.type',
                  address: '$policyData.model.address',
                  recipients: '$policyData.model.recipients',
                  ratios: '$policyData.model.ratios',
                  gaugeVoterAddress: '$policyData.model.gaugeVoterAddress',
                },
                else: null,
              },
            },
            source: {
              $cond: {
                if: { $ifNull: ['$policyData.source.address', false] },
                then: {
                  type: '$policyData.source.type',
                  address: '$policyData.source.address',
                  vaultAddress: '$policyData.source.vaultAddress',
                  token: {
                    $cond: {
                      if: { $gt: [{ $size: { $ifNull: ['$sourceToken', []] } }, 0] },
                      then: { $arrayElemAt: ['$sourceToken', 0] },
                      else: {
                        address: '$policyData.source.tokenAddress',
                        symbol: null,
                        name: null,
                        decimals: null,
                        logo: null,
                      },
                    },
                  },
                  amountPerEpoch: '$policyData.source.amountPerEpoch',
                  maxSourceBalance: '$policyData.source.maxSourceBalance',
                  epochInterval: '$policyData.source.epochInterval',
                },
                else: null,
              },
            },
            swap: {
              $cond: {
                if: { $ifNull: ['$policyData.swap.targetTokenAddress', false] },
                then: {
                  targetToken: {
                    $cond: {
                      if: { $gt: [{ $size: { $ifNull: ['$swapTargetToken', []] } }, 0] },
                      then: { $arrayElemAt: ['$swapTargetToken', 0] },
                      else: {
                        address: '$policyData.swap.targetTokenAddress',
                        symbol: null,
                        name: null,
                        decimals: null,
                        logo: null,
                      },
                    },
                  },
                  cowSwapSettlement: '$policyData.swap.cowSwapSettlement',
                  cowSwapRelayer: '$policyData.swap.cowSwapRelayer',
                  uniswapRouter: '$policyData.swap.uniswapRouter',
                },
                else: null,
              },
            },
            subRouters: {
              $cond: {
                if: { $gt: [{ $size: { $ifNull: ['$policyData.subRouters', []] } }, 0] },
                then: '$policyData.subRouters',
                else: [],
              },
            },
            subClaimers: {
              $cond: {
                if: { $gt: [{ $size: { $ifNull: ['$policyData.subClaimers', []] } }, 0] },
                then: '$policyData.subClaimers',
                else: [],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          description: 1,
          links: 1,
          policyKey: 1,
          address: 1,
          interfaceType: 1,
          strategy: 1,
          release: 1,
          build: 1,
          blockTimestamp: 1,
          transactionHash: 1,
          metadataIpfs: 1,
          network: 1,
          daoAddress: 1,
          slug: 1,
        },
      },
    ]

    return this.aggregate(aggQuery)
  }

  async update(params: Partial<Plugin>, tOpts?: SaveOptions) {
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

  async getActiveSettings(tOpts?: SaveOptions) {
    return await this.model(ICollectionNames.Setting).findOne(
      {
        pluginAddress: this.address,
        status: ISettingStatus.active,
      },
      tOpts,
    )
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
