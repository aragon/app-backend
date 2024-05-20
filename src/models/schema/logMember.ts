import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogMember, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

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

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

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

  @prop({ type: () => String })
  public pluginAddress!: HexAddress

  static async create(rawData: Partial<LogMember>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.event, 'event name is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.event!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, event: IEventLogMember) {
    return `${transactionHash}-${event}`
  }

  static async findByTxHash(transactionHash: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ transactionHash }, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  static async findExistingLog(transactionHash: HexAddress, event: IEventLogMember, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, event)
    return await this.findByEntityId(entityId, tOpts)
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
