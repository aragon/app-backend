import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type ILogProposalIdParams,
  type IMemberActivityMetrics,
  type IMemberProposalMetrics,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogProposal'

class Action {
  @prop({ type: () => String, default: null })
  public to!: string

  @prop({ type: () => String, default: null })
  public value!: string

  @prop({ type: () => String, default: null })
  public data!: string
}

export class Vote {
  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public proposalId!: number

  @prop({ type: () => String, default: null })
  public memberAddress!: HexAddress

  @prop({ type: () => Number })
  public voteOption?: number

  @prop({ type: () => String, default: null })
  public votingPower?: string
}

export class ProposalExecuted {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'logProposal',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  pluginAddress: 1,
  creatorAddress: 1,
})
export default class LogProposal extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public proposalId!: number

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public startDate!: number

  @prop({ type: () => Number, required: true })
  public endDate!: number

  @prop({ type: () => Number, required: true })
  public allowFailureMap!: number

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => [Action], _id: false, default: [] })
  public actions!: Action[]

  @prop({ type: () => [Vote], _id: false, default: [] })
  public voteEvents!: Vote[]

  @prop({ type: () => ProposalExecuted, _id: false })
  public executed!: ProposalExecuted

  static async create(rawData: Partial<LogProposal>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(rawData?.proposalId! >= 0, 'proposalId is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalId: rawData?.proposalId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogProposalIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}-${params.proposalId}`
    return entityId
  }

  static async findExistingLog(params: ILogProposalIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async getMemberProposalMetrics(memberAddress: HexAddress, pluginAddress: HexAddress) {
    const metrics = await this.aggregate([
      {
        $match: {
          pluginAddress,
        },
      },
      {
        $facet: {
          proposalCount: [
            {
              $match: {
                creatorAddress: memberAddress,
              },
            },
            {
              $count: 'count',
            },
          ],
          voteCount: [
            {
              $unwind: '$voteEvents',
            },
            {
              $match: {
                'voteEvents.memberAddress': memberAddress,
              },
            },
            {
              $count: 'count',
            },
          ],
        },
      },
      {
        $project: {
          proposalCount: { $ifNull: [{ $arrayElemAt: ['$proposalCount.count', 0] }, 0] },
          voteCount: { $ifNull: [{ $arrayElemAt: ['$voteCount.count', 0] }, 0] },
        },
      },
    ])
    return metrics?.[0] as IMemberProposalMetrics
  }

  static async getMemberActivity(memberAddress: HexAddress) {
    const query = [
      {
        $facet: {
          voteActivity: [
            {
              $unwind: '$voteEvents',
            },
            {
              $match: {
                'voteEvents.memberAddress': memberAddress,
              },
            },
            {
              $project: {
                network: 1,
                blockNumber: '$voteEvents.blockNumber',
              },
            },
          ],
          proposalActivity: [
            {
              $match: {
                creatorAddress: memberAddress,
              },
            },
            {
              $project: {
                network: 1,
                blockNumber: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          allActivities: {
            $concatArrays: ['$voteActivity', '$proposalActivity'],
          },
        },
      },
      {
        $unwind: '$allActivities',
      },
      {
        $group: {
          _id: null,
          firstActivity: {
            $min: {
              blockNumber: '$allActivities.blockNumber',
              network: '$allActivities.network',
            },
          },
          lastActivity: {
            $max: {
              blockNumber: '$allActivities.blockNumber',
              network: '$allActivities.network',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          firstActivity: 1,
          lastActivity: 1,
        },
      },
    ]

    const activity = await this.aggregate(query)
    return activity?.[0] as IMemberActivityMetrics
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByProposalId(proposalId: number, pluginAddress: string, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ proposalId, pluginAddress, network }, tOpts)
  }

  async update(params: Partial<LogProposal>, tOpts?: SaveOptions) {
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

  async findVote(transactionHash: any) {
    if (!this.voteEvents || this.voteEvents.length === 0) {
      return false
    }

    const vote = this.voteEvents.find(
      v => v.transactionHash?.trim().toLowerCase() === transactionHash.trim().toLowerCase(),
    )
    return vote || false
  }

  async addVoteEvent(voteEvent: Vote, tOpts = {}) {
    this.voteEvents = this.voteEvents ?? []
    this.voteEvents.push(voteEvent)

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
