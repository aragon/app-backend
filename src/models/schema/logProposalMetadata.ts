import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type ILogProposalMetadataIdParams, NetworksEnum } from '@types'
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
    id: false,
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
  pluginAddress: 1,
  proposalId: 1,
  blockNumber: 1,
})
export default class LogProposalMetadata extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

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

  @prop({ type: () => [Resource], _id: false, default: [] })
  public resources?: Resource[]

  @prop({ type: () => Media, _id: false, default: null })
  public media!: Media

  static async create(rawData: Partial<LogProposalMetadata>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!(rawData?.proposalId! >= 0), 'proposalId is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalId: rawData?.proposalId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogProposalMetadataIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}-${params.proposalId}`
    return entityId
  }

  static async findExistingLog(params: ILogProposalMetadataIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
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
