import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, IEventLogPolicyType, type ILogPolicyIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.LogPolicy

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({ network: 1, blockNumber: 1 })
@index({ address: 1, network: 1 })
@index({ event: 1, network: 1 })
export default class LogPolicy extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: IEventLogPolicyType, required: true })
  public event!: IEventLogPolicyType

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  static async create(rawData: Partial<LogPolicy>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(rawData.transactionIndex !== undefined, 'transactionIndex is required')
      assert(rawData.logIndex !== undefined, 'logIndex is required')
      assert(!!rawData.event, 'event is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        transactionHash: rawData.transactionHash!,
        transactionIndex: rawData.transactionIndex!,
        logIndex: rawData.logIndex!,
        event: rawData.event!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogPolicyIdParams) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.event}`
  }

  static async findExistingLog(params: ILogPolicyIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, null, tOpts)
  }

  static async findLatestByNetwork(network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ network }, null, tOpts).sort({ blockNumber: -1 })
  }

  static async findByEvent(event: IEventLogPolicyType, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.find({ event, network }, null, tOpts).sort({ blockNumber: -1 })
  }

  async update(params: Partial<LogPolicy>, tOpts?: SaveOptions) {
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
