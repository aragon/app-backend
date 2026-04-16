import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.LogDelegateChanged

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
@index({ tokenAddress: 1, network: 1 })
@index({ tokenAddress: 1, network: 1, blockNumber: -1, logIndex: -1 })
@index({ toDelegate: 1, network: 1, blockNumber: 1 })
@index({ delegator: 1, network: 1, blockNumber: 1 })
export default class LogDelegateChanged extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public delegator!: HexAddress

  @prop({ type: () => String, required: true })
  public fromDelegate!: HexAddress

  @prop({ type: () => String, required: true })
  public toDelegate!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  static getEntityId(params: {
    network: NetworksEnum
    transactionHash: string
    transactionIndex: number
    logIndex: number
  }) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}`
  }

  static async create(rawData: Partial<LogDelegateChanged> = {} as Partial<LogDelegateChanged>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(rawData.transactionIndex !== undefined, 'transactionIndex is required')
      assert(rawData.logIndex !== undefined, 'logIndex is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        transactionHash: rawData.transactionHash!,
        transactionIndex: rawData.transactionIndex!,
        logIndex: rawData.logIndex!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findExistingLog(
    params: { network: NetworksEnum; transactionHash: string; transactionIndex: number; logIndex: number },
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ id: this.getEntityId(params) }, null, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async countActiveDelegationsForMembers(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    memberAddresses: string[],
  ): Promise<Record<string, number>> {
    if (!memberAddresses.length) return {}

    const results = await this.aggregate([
      {
        $match: {
          tokenAddress,
          network,
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: '$delegator',
          toDelegate: { $first: '$toDelegate' },
        },
      },
      {
        $match: {
          toDelegate: { $in: memberAddresses },
        },
      },
      {
        $group: {
          _id: '$toDelegate',
          count: { $sum: 1 },
        },
      },
    ]).allowDiskUse(true)

    return results.reduce((acc: Record<string, number>, item: { _id: string; count: number }) => {
      acc[item._id] = item.count
      return acc
    }, {})
  }

  static async findLatestByDelegates(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    addresses: string[],
    maxBlockTimestamp: number,
  ) {
    return this.aggregate([
      {
        $match: {
          tokenAddress,
          network,
          blockTimestamp: { $lte: maxBlockTimestamp },
        },
      },
      { $sort: { blockTimestamp: -1, logIndex: -1 } },
      {
        $group: {
          _id: '$delegator',
          toDelegate: { $first: '$toDelegate' },
          blockTimestamp: { $first: '$blockTimestamp' },
          logIndex: { $first: '$logIndex' },
        },
      },
      {
        $match: {
          toDelegate: { $in: addresses },
        },
      },
    ])
  }
}
