import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type ILockIdParams, ICollectionNames, NetworksEnum, type ILockFindMemberParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.Lock

export class LockWithdraw {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => String, default: '0' })
  public totalLocked!: string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => Number, default: null })
  public epochEndAt!: number | null
}

export class LockExit {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress | null

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => Number, default: null })
  public exitDateAt!: number | null
}

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
@index({ id: 1 }, { unique: true })
export default class Lock extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  // Timestamp of when the lock has been created (timestamp of the transaction)
  @prop({ type: () => Number, default: null })
  public blockTimestamp!: number | null

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  // erc20 token address
  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  // Nft token address
  @prop({ type: () => String, required: true })
  public nftAddress!: HexAddress

  // ID of the received NFT (emitted by the Deposit event)
  @prop({ type: () => String, default: null })
  public tokenId!: string

  // Amount of tokens locked (emitted by the Deposit event)
  @prop({ type: () => String, default: '0' })
  public amount!: string

  // Timestamp of the lock epoch (emitted by the Deposit event)
  @prop({ type: () => Number, default: null })
  public epochStartAt!: number

  @prop({ type: () => String, default: '0' })
  public totalLocked!: string

  @prop({ type: () => LockExit, _id: false, default: {} })
  public lockExit!: LockExit

  @prop({ type: () => LockWithdraw, _id: false, default: {} })
  public lockWithdraw!: LockWithdraw

  static async create(rawData: Partial<Lock>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        tokenAddress: rawData?.tokenAddress!,
        memberAddress: rawData?.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILockIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.tokenAddress}-${params.memberAddress}`
    return entityId
  }

  static async findExistingLog(params: ILockIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findLockMember(params: ILockFindMemberParams, tOpts?: SaveOptions) {
    return await this.findOne(params, null, tOpts)
  }

  async update(params: Partial<Lock>, tOpts?: SaveOptions) {
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
