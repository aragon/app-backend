import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

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
@index({
  metadataUri: 1,
  ens: 1,
  network: 1,
  lastBlockSync: 1,
})
export default class LogDaoMetadata extends Model {
  @prop({ type: () => String, required: true, unique: true })
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
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findTxHash(transactionHash: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ transactionHash }, tOpts)
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
