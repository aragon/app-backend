import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type ILogDaoRegistryIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogDaoRegistry'

export class URIUpdate {
  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => String, required: true })
  public uri!: string

  @prop({ type: () => Number, required: true })
  public blockNumber!: number
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'logDaoRegistry',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
})
export default class LogDaoRegistry extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress?: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public subdomain!: string

  @prop({ type: () => [URIUpdate], _id: false, default: [] })
  public uriUpdates?: URIUpdate[]

  static async create(rawData: Partial<LogDaoRegistry>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({ transactionHash: rawData?.transactionHash!, address: rawData?.address! })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogDaoRegistryIdParams) {
    const entityId = `${params.transactionHash}-${params.address}`
    return entityId
  }

  static async findExistingLog(params: ILogDaoRegistryIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return this.findOne({ address, network }, tOpts)
  }

  async update(params: Partial<LogDaoRegistry>, tOpts?: SaveOptions) {
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

  async findUriEvent(transactionHash: any) {
    if (!this.uriUpdates || this.uriUpdates.length === 0) {
      return false
    }

    const uriEvent = this.uriUpdates.find(
      v => v.transactionHash?.trim().toLowerCase() === transactionHash.trim().toLowerCase(),
    )
    return uriEvent || false
  }

  async addUriEvent(rawUri: URIUpdate, tOpts = {}) {
    this.uriUpdates = this.uriUpdates ?? []
    this.uriUpdates.push(rawUri)

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
