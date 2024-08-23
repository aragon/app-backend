import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IMemberTransactionIdParams,
  ITransferSide,
  ITransferType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.MemberTransaction

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
@index({
  address: 1,
  network: 1,
  transactionHash: 1,
  blockNumber: 1,
  tokenAddress: 1,
})
export default class MemberTransaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public from!: HexAddress

  @prop({ type: () => String, default: null })
  public to!: HexAddress

  @prop({ type: () => String, enum: ITransferSide, required: true })
  public side!: ITransferSide

  @prop({ type: () => String, enum: ITransferType, required: true })
  public type!: ITransferType

  @prop({ type: () => String, default: '0' })
  public amount!: string

  // historical balance
  @prop({ type: () => String, default: '0' })
  public memberBalance!: string

  // historical voting power
  @prop({ type: () => String, default: '0' })
  public memberVotingPower!: string

  static async create(rawData: Partial<MemberTransaction>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.side, 'side is required')
      assert(!!rawData.type, 'type is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        address: rawData?.address!,
        side: rawData?.side!,
        type: rawData?.type!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberTransactionIdParams) {
    const entityId = `${params.transactionHash}-${params.address}-${params.type}-${params.side}`
    return entityId
  }

  static async findExistingLog(params: IMemberTransactionIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum) {
    return await this.findOne({ address, network })
  }

  async update(params: Partial<MemberTransaction>, tOpts?: SaveOptions) {
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
