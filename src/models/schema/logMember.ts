import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogMember, type IEventLogPluginType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

const customName = 'LogMember'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logMember',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  blockNumber: 1,
  transactionHash: 1,
})
export default class LogMember extends Model {
  @prop({ type: () => String, enum: IEventLogMember, required: true })
  public event!: IEventLogMember

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => [String], required: true })
  public members!: string[]

  @prop({ type: () => String })
  public tokenAddress!: HexAddress

  @prop({ type: () => String })
  public fromDelegate!: string

  @prop({ type: () => String })
  public toDelegate!: string

  @prop({ type: () => String })
  public delegatingMember!: string

  @prop({ type: () => String })
  public previousVotingPower!: string

  @prop({ type: () => String })
  public newVotingPower!: string

  static async create(rawData: Partial<LogMember>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findTxHash(transactionHash: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ transactionHash }, tOpts)
  }

  static async findTxHashAndEvent(transactionHash: HexAddress, event: IEventLogPluginType) {
    return await this.findOne({ transactionHash, event })
  }

  async update(params: Partial<LogMember>, tOpts?: SaveOptions) {
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
