import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogMember, type ILogMemberIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogMember'

@modelOptions({
  schemaOptions: {
    id: false,
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
  event: 1,
  address: 1,
  tokenAddress: 1,
  pluginAddress: 1,
})
export default class LogMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

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

  @prop({ type: () => String })
  public tokenAddress!: HexAddress

  @prop({ type: () => String })
  public fromDelegate!: HexAddress

  @prop({ type: () => String })
  public toDelegate!: HexAddress

  @prop({ type: () => String })
  public delegatingMember!: HexAddress

  @prop({ type: () => String })
  public previousVotingPower!: string

  @prop({ type: () => String })
  public newVotingPower!: string

  @prop({ type: () => String })
  public pluginAddress!: HexAddress

  static async create(rawData: Partial<LogMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.event, 'event is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        event: rawData?.event!,
        address: rawData?.address!,
        network: rawData?.network!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogMemberIdParams) {
    return `${params.network}-${params.transactionHash}-${params.event}-${params.pluginAddress}-${params.address}`
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findExistingLog(params: ILogMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
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
