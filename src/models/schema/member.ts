import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  IMembersResponse,
  IPaginatedResult,
  type IPaginationParams,
  NetworksEnum
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from "@models/utils/models";

const customName = 'Member'

class MemberDao {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

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

  static async findMembersByPlugin(pluginAddress: string, opts: IPaginationParams): Promise<IPaginatedResult<IMembersResponse>> {
    const request = Object.assign({}, ModelUtils.requestPaginate(opts, {orderProp: 'fromBlockNumber'}))

    return await this.aggregate([
      {
        $unwind: '$daos',
      },
      {
        $match: {
          'daos.pluginAddress': pluginAddress,
        },
      },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          votingPower: {
            $cond: {
              if: { $gt: [{ $type: '$daos.votingPower' }, 'missing'] },
              then: '$daos.votingPower',
              else: '$$REMOVE',
            },
          },
          fromBlockNumber: '$daos.fromBlockNumber',
          toBlockNumber: '$daos.toBlockNumber',
        },
      },
      {
        $sort: {
          [request.orderProp]: request.order === 'asc' ? 1 : -1,
        },
      },
      {
        $facet: {
          metadata: [
            { $count: 'total' },
            {
              $addFields: {
                currentPage: { $literal: Math.floor(request.skip / request.limit) + 1 },
                limit: { $toInt: request.limit },
                skip: { $toInt: request.skip },
                order: { $literal: request.order },
                orderProp: { $literal: request.orderProp },
                totPages: {
                  $ceil: { $divide: ['$total', request.limit] },
                },
              },
            },
          ],
          data: [{ $skip: request.skip }, { $limit: request.limit }],
        },
      },
      {
        $unwind: '$metadata',
      },
      {
        $project: {
          data: 1,
          metadata: {
            totRecords: '$metadata.total',
            limit: { $toInt: '$metadata.limit' },
            skip: { $toInt: '$metadata.skip' },
            order: '$metadata.order',
            orderProp: '$metadata.orderProp',
            currentPage: { $toInt: '$metadata.currentPage' },
            totPages: { $toInt: '$metadata.totPages' },
          },
        },
      },
    ]) as any
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
