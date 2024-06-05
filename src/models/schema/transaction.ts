import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'Transaction'

class ERC1155Metadata {
  @prop({ type: () => String, default: null })
  public tokenId!: string

  @prop({ type: () => String, default: null })
  public value!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'transaction',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  fromAddress: 1,
  toAddress: 1,
  tokenAddress: 1,
  daoAddress: 1,
})
export default class Transaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITransactionType, required: true })
  public type!: ITransactionType

  @prop({ type: () => String, enum: ITransactionCategory, required: true })
  public category!: ITransactionCategory

  @prop({ type: () => String, required: true })
  public fromAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public toAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public value!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenId!: string

  @prop({ type: () => String, default: null })
  public erc721TokenId!: string

  @prop({ type: () => [ERC1155Metadata], default: [] })
  public erc1155Metadata!: ERC1155Metadata[]

  @prop({ type: () => String, default: null })
  public proposalId!: string

  static async create(rawData: Partial<Transaction>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.category, 'category is required')
      assert(!!rawData.network, 'network is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.category!, rawData?.network!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, category: ITransactionCategory, network: NetworksEnum) {
    const entityId = `${transactionHash}-${category}-${network}`
    return entityId
  }

  static async findExistingLog(
    transactionHash: HexAddress,
    category: ITransactionCategory,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    const entityId = this.getEntityId(transactionHash, category, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<Transaction>, tOpts?: SaveOptions) {
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
