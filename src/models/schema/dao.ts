import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type ENS, HexAddress, type IPaginationParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { assert } from '@errors'

const customName = 'Dao'

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

class Plugin {
  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSetupRepoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => String, default: null })
  public subdomain!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'dao',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
  permalink: 1,
  name: 1,
  creatorAddress: 1,
  tvlUSD: 1,
})
export default class Dao extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, required: true, unique: true })
  public permalink!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens?: ENS | null

  @prop({ type: () => Number, default: 0 })
  public members!: number

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], default: [] })
  public links?: Link[]

  @prop({ type: () => [Plugin], default: [] })
  public plugins?: Plugin[]

  @prop({ type: () => String, default: '0' })
  public tvlUSD!: string

  @prop({ type: () => Number, default: 0 })
  public proposalsCreated!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsExecuted!: number

  @prop({ type: () => Number, default: 0 })
  public uniqueVoters!: number

  @prop({ type: () => Number, default: 0 })
  public votes!: number

  @prop({ type: () => Boolean, default: false })
  public hideDao!: boolean

  static async create(rawData: Partial<Dao>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      rawData.entityId = this.getEntityId(rawData?.address!, rawData?.network as any)
    }
    if (!rawData.permalink) {
      const network = rawData.network
      const ensOrAddress = rawData.ens || rawData.address
      rawData.permalink = `${network}-${ensOrAddress}`
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(address: HexAddress, network: NetworksEnum) {
    const entityId = `${address}-${network}`
    return entityId
  }

  static async findExistingLog(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(address, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  static async findByPermalink(permalink: string) {
    return await this.findOne({ permalink })
  }

  static async findWithPagination({ networks, pluginAddress }, opts: IPaginationParams = {}) {
    const params = Object.assign(
      {},
      ModelUtils.parseParams(opts, [
        'permalink',
        'address',
        'implementationAddress',
        'creatorAddress',
        'ens',
        'name',
        'transactionHash',
      ]),
    )
    params.hideDao = { $ne: true }

    if (pluginAddress) {
      params['plugins.address'] = pluginAddress
    }

    if (networks?.length > 0) {
      params.network = { $in: networks }
    }

    const request = Object.assign({}, ModelUtils.requestPaginate(opts))
    const currentPage = opts.skip || 1

    const [data, totRecords] = await Promise.all([this.find(params, null, request), this.countDocuments(params)])

    const totPages = Math.ceil(totRecords / request.limit)

    if (currentPage > totPages) {
      return {
        data: [],
        totRecords: 0,
        currentPage: 1,
        totPages: 1,
        limit: request.limit,
        skip: request.skip,
        order: opts.order,
        orderProp: opts.orderProp,
      }
    }

    return {
      metadata: {
        currentPage,
        totPages,
        totRecords,
        limit: request.limit,
        skip: request.skip,
        order: opts.order,
        orderProp: opts.orderProp,
      },
      data,
    }
  }

  async update(params: Partial<Dao>, tOpts?: SaveOptions) {
    Object.entries(params)
      .filter(([key]) => key !== 'permalink')
      .forEach(([key, value]) => {
        if (this.schema.tree[key]) {
          if (!this.schema.tree[key].required || this.schema.tree[key].required) {
            const parsedObj = this.toObject()
            if (!_.isEqual(parsedObj[key], value)) {
              this[key] = value

              if (key === 'ens' || key === 'address') {
                this['permalink'] = `${this.network}-${this.ens || this.address}`
              }
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
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    filtered.plugins = filtered.plugins.map((plugin: any) => _.omit(plugin, 'id', '_id', '__v'))
    return filtered
  }
}
