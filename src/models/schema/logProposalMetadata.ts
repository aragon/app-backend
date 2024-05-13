import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

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
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Boolean, default: null })
  public fetchedMetadata!: boolean

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number, default: null })
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
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findTxHash(transactionHash: HexAddress) {
    return await this.findOne({ transactionHash })
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
