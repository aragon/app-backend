import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPluginIdParams,
  IPluginInterfaceType,
  IPluginStatus,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

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

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
