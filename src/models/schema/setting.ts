import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IPaginationParams,
  type ISettingExtraParams,
  type ISettingIdParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Setting'

class Settings {
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

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'setting',
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
export default class Setting extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public fromTxHash!: HexAddress

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public fromBlockNumber!: number

  @prop({ type: () => Number })
  public toBlockNumber?: number

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => Settings })
  public settings?: Settings

  static async create(rawData: Partial<Setting>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.fromTxHash, 'fromTxHash is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({ fromTxHash: rawData?.fromTxHash!, network: rawData?.network! })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISettingIdParams) {
    const entityId = `${params.fromTxHash}-${params.network}`
    return entityId
  }

  static async findExistingLog(params: ISettingIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByTransactionHash(fromTxHash: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ fromTxHash, network }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: ISettingExtraParams
    paginationParams?: IPaginationParams
  }) {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && key !== 'onlyActive'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['pluginAddress', 'daoAddress', 'network']),
      ...dynamicFilter,
    }

    // only filter active setting in dao
    if (extraParams.onlyActive) {
      filter['$or'] = [{ toBlockNumber: null }, { toBlockNumber: { $exists: false } }]
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
      data,
    }
  }

  async update(params: Partial<Setting>, tOpts?: SaveOptions) {
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
    return filtered
  }
}
