import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IMembersResponse, type IPaginatedResult, type IPaginationParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Member'

class MemberDao {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number })
  public fromBlockNumber!: number

  @prop({ type: () => String })
  public fromTxHash!: HexAddress

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => String })
  public votingPower!: string

  @prop({ type: () => String })
  public delegateFromAddress!: HexAddress

  @prop({ type: () => String })
  public delegateToAddress!: HexAddress
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'member',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
  'daos.pluginAddress': 1,
})
export default class Member extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: HexAddress

  @prop({ type: () => [MemberDao], default: [] })
  public daos?: MemberDao[]

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.address, 'address is required')
      rawData.entityId = this.getEntityId(rawData?.address!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(address: HexAddress) {
    const entityId = `${address}`
    return entityId
  }

  static async findExistingLog(address: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(address)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  static async findWithPagination(
    { daoAddress, pluginAddress },
    opts: IPaginationParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> {
    const request = Object.assign({}, ModelUtils.requestPaginate(opts, { orderProp: opts.orderProp }))

    const matchStage: any = {}

    if (daoAddress) {
      matchStage['daos.daoAddress'] = daoAddress
    }

    if (pluginAddress) {
      matchStage['daos.pluginAddress'] = pluginAddress
    }

    const totalCount = await this.countDocuments(matchStage)
    const totalPages = Math.ceil(totalCount / request.limit)

    const result = await this.aggregate([
      { $unwind: '$daos' },
      { $match: matchStage },
      { $skip: request.skip },
      { $limit: request.limit },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          fromBlockNumber: '$daos.fromBlockNumber',
          toBlockNumber: '$daos.toBlockNumber',
          votingPower: {
            $cond: {
              if: { $gt: [{ $type: '$daos.votingPower' }, 'missing'] },
              then: '$daos.votingPower',
              else: '$$REMOVE',
            },
          },
        },
      },
      { $sort: request.sort },
    ])

    return {
      metadata: {
        limit: request.limit,
        skip: request.skip,
        order: opts.order,
        orderProp: opts.orderProp,
        currentPage: request.skip / request.limit + 1,
        totPages: totalPages,
        totRecords: totalCount,
      },
      data: result,
    }
  }

  async update(params: Partial<Member>, tOpts?: SaveOptions) {
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
