import { Models } from '@dbModels'
import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type ActiveVoter, HexAddress, ICollectionNames, type IVoteGaugeIdParams, NetworksEnum } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.VoteGauge

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
@index({ network: 1, blockNumber: 1, gaugeAddress: 1, memberAddress: 1 })
@index({ network: 1, gaugeAddress: 1, epochId: 1 })
@index({ network: 1, gaugeAddress: 1, memberAddress: 1, epochId: 1, blockNumber: -1 })
@index({ gaugeAddress: 1, memberAddress: 1, epochId: 1 })
@index({ network: 1, transactionHash: 1 })
export default class VoteGauge extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public gaugeAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public epochId!: string

  @prop({ type: () => String, default: null })
  public votingPower?: string

  @prop({ type: () => String, enum: ['vote', 'reset'], default: 'vote' })
  public type!: string

  @prop({ type: () => Boolean, default: false })
  public persistentVote?: boolean

  static async create(rawData: Partial<VoteGauge> = {} as Partial<VoteGauge>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVoteGaugeIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.pluginAddress}`
    return entityId
  }

  static async findExistingLog(params: IVoteGaugeIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async countActiveVotesByEpochAndGauge(
    epochId: string,
    pluginAddress: HexAddress,
    gaugeAddress: HexAddress,
    network: NetworksEnum,
  ) {
    const result = await this.aggregate([
      {
        $match: {
          pluginAddress,
          gaugeAddress,
          network,
          $or: [{ epochId }, { persistentVote: true }],
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: '$memberAddress',
          latestVP: { $first: '$votingPower' },
        },
      },
      { $match: { latestVP: { $nin: ['0', null] } } },
    ])
    return result.length
  }

  async update(params: Partial<VoteGauge>, tOpts?: SaveOptions) {
    const parsedObj = this.toObject()
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
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

  static async getMostRecentVoteEvent(pluginAddress: HexAddress, network: NetworksEnum, timestamp: number) {
    return await Models.VoteGauge.findOne(
      { pluginAddress, network, blockTimestamp: { $lte: timestamp } },
      { transactionHash: 1 },
      { sort: { blockNumber: -1, logIndex: -1 } },
    )
  }

  static async getPerGaugeVP(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    voteEnd: number,
  ): Promise<Map<string, bigint>> {
    const result = await this.aggregate([
      {
        $match: {
          pluginAddress,
          network,
          blockTimestamp: { $lte: voteEnd },
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: { member: '$memberAddress', gauge: '$gaugeAddress' },
          latestVP: { $first: '$votingPower' },
        },
      },
      { $match: { latestVP: { $nin: ['0', null] } } },
      {
        $group: {
          _id: '$_id.gauge',
          totalGaugeVP: { $sum: { $toDecimal: '$latestVP' } },
        },
      },
      {
        $addFields: {
          totalGaugeVP: {
            $convert: {
              input: { $round: ['$totalGaugeVP', 0] },
              to: 'string',
              onError: { $toString: { $round: ['$totalGaugeVP', 0] } },
            },
          },
        },
      },
    ])

    const gaugeVPMap = new Map<string, bigint>()
    for (const entry of result) {
      gaugeVPMap.set(entry._id, BigInt(entry.totalGaugeVP))
    }
    return gaugeVPMap
  }

  static async getActiveVoters(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    voteEnd: number,
  ): Promise<ActiveVoter[]> {
    const memberVotes = await this.aggregate([
      {
        $match: {
          pluginAddress,
          network,
          blockTimestamp: { $lte: voteEnd },
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: { member: '$memberAddress', gauge: '$gaugeAddress' },
          latestVP: { $first: '$votingPower' },
          latestBlock: { $first: '$blockNumber' },
          latestLogIndex: { $first: '$logIndex' },
          latestTxHash: { $first: '$transactionHash' },
          latestBlockTimestamp: { $first: '$blockTimestamp' },
        },
      },
      { $match: { latestVP: { $nin: ['0', null] } } },
      { $sort: { latestBlock: -1, latestLogIndex: -1 } },
      {
        $group: {
          _id: '$_id.member',
          totalVotingPower: {
            $sum: { $toDecimal: '$latestVP' },
          },
          latestBlock: { $first: '$latestBlock' },
          latestLogIndex: { $first: '$latestLogIndex' },
          latestTxHash: { $first: '$latestTxHash' },
          latestBlockTimestamp: { $first: '$latestBlockTimestamp' },
        },
      },
      { $match: { totalVotingPower: { $gt: 0 } } },
      {
        $addFields: {
          totalVotingPower: {
            $convert: {
              input: { $round: ['$totalVotingPower', 0] },
              to: 'string',
              onError: { $toString: { $round: ['$totalVotingPower', 0] } },
            },
          },
        },
      },
      { $sort: { latestBlock: -1 } },
    ])

    return memberVotes.map((vote: any) => ({
      voter: vote._id,
      usedVP: BigInt(vote.totalVotingPower),
      latestTxHash: vote.latestTxHash,
      latestBlock: vote.latestBlock,
      latestLogIndex: vote.latestLogIndex,
      latestBlockTimestamp: vote.latestBlockTimestamp,
    }))
  }

  static async getLatestTxPerGauge(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    timestamp: number,
  ): Promise<Array<{ gaugeAddress: string; transactionHash: string; blockNumber: number }>> {
    return await this.aggregate([
      {
        $match: {
          pluginAddress,
          network,
          blockTimestamp: { $lte: timestamp },
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: '$gaugeAddress',
          transactionHash: { $first: '$transactionHash' },
          blockNumber: { $first: '$blockNumber' },
        },
      },
      {
        $project: {
          _id: 0,
          gaugeAddress: '$_id',
          transactionHash: 1,
          blockNumber: 1,
        },
      },
    ])
  }
}
