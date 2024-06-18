import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IPaginatedResult,
  type IPaginationParams,
  type IProposalExtraParams,
  type IProposalIdParams,
  type IProposalsResponse,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Proposal'

class Media {
  @prop({ type: () => String, default: null })
  public header!: string

  @prop({ type: () => String, default: null })
  public logo!: string
}

export class Settings {
  @prop({ type: () => String, default: null })
  public fromTxHash!: HexAddress

  @prop({ type: () => String, default: null })
  public toTxHash!: HexAddress

  @prop({ type: () => Number })
  public fromBlockNumber!: number

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => Number })
  public votingMode!: number

  @prop({ type: () => Number })
  public supportThreshold!: number

  @prop({ type: () => Number })
  public minParticipation!: number

  @prop({ type: () => Number })
  public minDuration!: number

  @prop({ type: () => String })
  public minProposerVotingPower!: string

  @prop({ type: () => Number })
  public minApprovals!: number

  @prop({ type: () => Boolean })
  public onlyListed!: boolean
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
    collection: 'proposal',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  pluginAddress: 1,
})
export default class Proposal extends Model {
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

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public proposalId!: number

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public startDate!: number

  @prop({ type: () => Number, required: true })
  public endDate!: number

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => String, default: null })
  public title!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public summary!: string

  @prop({ type: () => ProposalExecuted })
  public executed!: ProposalExecuted

  @prop({ type: () => Settings })
  public settings!: Settings

  @prop({ type: () => Media })
  public media!: Media

  static async create(rawData: Partial<Proposal>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!(rawData?.proposalId! >= 0), 'proposalId is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
        proposalId: rawData?.proposalId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IProposalIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}-${params.proposalId}`
    return entityId
  }

  static async findExistingLog(params: IProposalIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByProposalId(proposalId: number, pluginAddress: string, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ proposalId, pluginAddress, network }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IProposalExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IProposalsResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_, v]) => v !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'title',
        'description',
        'summary',
        'creatorAddress',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([this.find(filter, null, request), this.countDocuments(filter)])

    const totalPages = Math.ceil(totalRecords / request.limit)

    if (currentPage > totalPages) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    return {
      metadata: {
        page: currentPage,
        pageSize: request.limit,
        totalPages,
        totalRecords,
      },
      data: data as any,
    }
  }

  async update(params: Partial<Proposal>, tOpts?: SaveOptions) {
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

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', '__v', 'createdAt', 'updatedAt')
    filtered.settings = _.omit(filtered.settings, 'id', '_id', '__v')
    filtered.media = _.omit(filtered.media, 'id', '_id', '__v')
    return filtered
  }
}
