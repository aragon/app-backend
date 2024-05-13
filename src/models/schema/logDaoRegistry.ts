import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ENS, HexAddress, NetworksEnum, DepositType } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

const customName = 'LogDaoRegistry'

class Deposit {
  @prop({ type: () => String, enum: DepositType, required: true })
  public type!: DepositType

  @prop({ type: () => String})
  public amount!: string

  @prop({ type: () => String })
  public depositorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public token!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => String, required: true })
  public blockNumber!: string
}

class URIUpdate {
  @prop({ type: () => String, required: true })
  public uri!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => String, required: true })
  public blockNumber!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logDaoRegistry',
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
  lastBlockSync: 1,
})

export default class LogDaoRegistry extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: ENS

  @prop({ type: () => [URIUpdate], default: [] })
  public actionEvents!: URIUpdate[]

  @prop({ type: () => [Deposit], default: [] })
  public depositEvents!: Deposit[]

  static async create(rawData: Partial<LogDaoRegistry>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findTxHash(transactionHash: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ transactionHash }, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, tOpts)
  }

  static async findDepositTxHashWithDaoAddress(transactionHash: HexAddress, address: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ 'deposits.transactionHash': transactionHash, address }, tOpts)
  }

  static async findURIUpdatesTxHashWithDaoAddress(transactionHash: HexAddress, address: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ 'uriUpdates.transactionHash': transactionHash, address }, tOpts)
  }

  async update(params: Partial<LogDaoRegistry>, tOpts?: SaveOptions) {
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

  async addDeposit(deposit: Deposit, tOpts?: SaveOptions) {
    this.deposits = this.deposits || []
    this.deposits.push(deposit)
    return await this.save(tOpts)
  }

  async addURIUpdates(uriUpdates: URIUpdate, tOpts?: SaveOptions) {
    this.uriUpdates = this.uriUpdates || []
    this.uriUpdates.push(uriUpdates)
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
