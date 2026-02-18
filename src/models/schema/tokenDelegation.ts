import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.TokenDelegation

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
@index({ contractAddress: 1, network: 1, blockNumber: 1 })
@index({ delegator: 1, contractAddress: 1, network: 1 })
export default class TokenDelegation extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public contractAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public delegator!: HexAddress

  @prop({ type: () => String, required: true })
  public delegate!: HexAddress

  @prop({ type: () => [String], required: true })
  public tokenIds!: string[]

  @prop({ type: () => String, required: true, enum: ['delegate', 'undelegate'] })
  public action!: 'delegate' | 'undelegate'

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

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

  static async findExistingLog(
    params: { network: NetworksEnum; transactionHash: string; transactionIndex: number; logIndex: number },
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ id: this.getEntityId(params) }, null, tOpts)
  }

  static async createLog(data: Partial<TokenDelegation>, tOpts?: SaveOptions) {
    if (!data.id) {
      data.id = this.getEntityId({
        network: data.network!,
        transactionHash: data.transactionHash!,
        transactionIndex: data.transactionIndex!,
        logIndex: data.logIndex!,
      })
    }

    return this.findOneAndUpdate({ id: data.id }, { $setOnInsert: data }, { upsert: true, new: true, ...tOpts })
  }

  /**
   * Reconstruct active veToken delegations at a given block.
   * For each (delegator, delegate, tokenId) triple, finds the latest action.
   * Returns only tokenIds whose latest action is 'delegate'.
   */
  static async getDelegationSnapshots(
    contractAddress: string,
    network: NetworksEnum,
    delegateAddresses: string[],
    maxBlock: number,
  ) {
    return this.aggregate([
      { $match: { contractAddress, network, blockNumber: { $lte: maxBlock } } },
      { $unwind: '$tokenIds' },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: { delegator: '$delegator', delegate: '$delegate', tokenId: '$tokenIds' },
          snapshots: {
            $push: { action: '$action', blockNumber: '$blockNumber', logIndex: '$logIndex' },
          },
        },
      },
      { $match: { '_id.delegate': { $in: delegateAddresses } } },
    ])
  }

  static async findActiveDelegationsAtBlock(
    contractAddress: string,
    network: NetworksEnum,
    delegateAddresses: string[],
    maxBlock: number,
  ) {
    return this.aggregate([
      {
        $match: {
          contractAddress,
          network,
          blockNumber: { $lte: maxBlock },
        },
      },
      { $unwind: '$tokenIds' },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: { delegator: '$delegator', delegate: '$delegate', tokenId: '$tokenIds' },
          action: { $first: '$action' },
        },
      },
      { $match: { action: 'delegate' } },
      { $match: { '_id.delegate': { $in: delegateAddresses } } },
      {
        $group: {
          _id: { delegator: '$_id.delegator', delegate: '$_id.delegate' },
          tokenIds: { $push: '$_id.tokenId' },
        },
      },
      {
        $project: {
          _id: 0,
          delegator: '$_id.delegator',
          delegate: '$_id.delegate',
          tokenIds: 1,
        },
      },
    ])
  }
}
