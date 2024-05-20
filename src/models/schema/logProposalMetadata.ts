import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogProposalMetadata'

class Resource {
  @prop({ type: () => String, default: null })
  public url!: string

  @prop({ type: () => String, default: null })
  public name!: string
}

class Media {
  @prop({ type: () => String, default: null })
  public header!: string

  @prop({ type: () => String, default: null })
  public logo!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logProposalMetadata',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  transactionHash: 1,
  network: 1,
  blockNumber: 1,
})
export default class LogProposalMetadata extends Model {
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
  public pluginAddress!: HexAddress

  @prop({ type: () => Number })
  public proposalId!: number

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => String, default: null })
  public title!: string

  @prop({ type: () => String, default: null })
  public summary!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => [Resource], default: [] })
  public resources?: Resource[]

  @prop({ type: () => Media, default: null })
  public media!: Media

  static async create(rawData: Partial<LogProposalMetadata>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!(rawData?.proposalId! >= 0), 'proposalId is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.pluginAddress!, rawData?.proposalId!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, pluginAddress: HexAddress, proposalId: number) {
    const entityId = `${transactionHash}-${pluginAddress}-${proposalId}`
    return entityId
  }

  static async findExistingLog(
    transactionHash: HexAddress,
    pluginAddress: HexAddress,
    proposalId: number,
    tOpts?: SaveOptions,
  ) {
    const entityId = this.getEntityId(transactionHash, pluginAddress, proposalId)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogProposalMetadata>, tOpts?: SaveOptions) {
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
