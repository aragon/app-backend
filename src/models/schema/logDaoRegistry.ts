import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ENS, HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogDaoRegistry'

class URIUpdate {
  @prop({ type: () => String, required: true })
  public uri!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => String, required: true })
  public blockNumber!: string
}

@modelOptions({
  schemaOptions: {
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
  daoAddress: 1,
})
export default class LogDaoRegistry extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: ENS

  @prop({ type: () => [URIUpdate], default: [] })
  public uriUpdates?: URIUpdate[]

  static async create(rawData: Partial<LogDaoRegistry>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.address, 'address is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.address!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, address: HexAddress) {
    const entityId = `${transactionHash}-${address}`
    return entityId
  }

  static findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return this.findOne({ address, network }, tOpts)
  }

  static async findExistingLog(transactionHash: HexAddress, address: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, address)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
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

  async addURIUpdates(uriUpdates: URIUpdate, tOpts?: SaveOptions) {
    this.uriUpdates = this.uriUpdates || []
    this.uriUpdates.push(uriUpdates)
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
