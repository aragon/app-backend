import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IMemberExtraParams,
  type IMemberIdParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
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

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

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
    id: false,
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
  public id!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: HexAddress

  @prop({ type: () => [MemberDao], default: [] })
  public daos?: MemberDao[]

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberIdParams) {
    const entityId = `${params.address}`
    return entityId
  }

  static async findExistingLog(params: IMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IMemberExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(
        ([key, value]) =>
          value !== undefined &&
          key !== 'network' &&
          key !== 'daoAddress' &&
          key !== 'pluginAddress' &&
          key !== 'onlyActive',
      ),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
      ...dynamicFilter,
    }

    // only filter active members in dao
    if (extraParams.onlyActive) {
      filter['$or'] = [{ 'daos.toBlockNumber': null }, { 'daos.toBlockNumber': { $exists: false } }]
    }

    if (extraParams.daoAddress) {
      filter['daos.daoAddress'] = extraParams.daoAddress
    }

    if (extraParams.pluginAddress) {
      filter['daos.pluginAddress'] = extraParams.pluginAddress
    }

    if (extraParams.network) {
      filter['daos.network'] = extraParams.network
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        { $unwind: '$daos' },
        { $match: filter },
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
      ]),
      this.countDocuments(filter),
    ])

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
      data,
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

  filterMemberKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', 'id', '__v', 'daos', 'createdAt', 'updatedAt')
    return filtered
  }

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    filtered.daos = _.omit(filtered.daos, '_id', '__v')
    return filtered
  }
}
