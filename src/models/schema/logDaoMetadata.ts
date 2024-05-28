import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogDaoMetadata'

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logDaoMetadata',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
// @index({
//   metadataUri: 1,
//   ens: 1,
//   network: 1,
//   lastBlockSync: 1,
// })
export default class LogDaoMetadata extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Boolean, default: null })
  public fetchedMetadata!: boolean

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public trustedForwarder!: HexAddress

  @prop({ type: () => String, default: null })
  public daoURI!: string

  @prop({ type: () => String, default: null })
  public ens!: string

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], default: [] })
  public links?: Link[]

  static async create(rawData: Partial<LogDaoMetadata>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.daoAddress!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, daoAddress: HexAddress) {
    const entityId = `${transactionHash}-${daoAddress}`
    return entityId
  }

  static async findExistingLog(transactionHash: HexAddress, daoAddress: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, daoAddress)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogDaoMetadata>, tOpts?: SaveOptions) {
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
