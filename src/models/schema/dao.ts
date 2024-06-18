import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type ENS,
  HexAddress,
  type IDaoExtraParams,
  type IDaoIdParams,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { assert } from '@errors'

const customName = 'Dao'

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

class Plugin {
  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSetupRepoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => String, default: null })
  public subdomain!: string
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'dao',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
  name: 1,
  creatorAddress: 1,
  tvlUSD: 1,
})
export default class Dao extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens?: ENS | null

  @prop({ type: () => Number, default: 0 })
  public members!: number

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], default: [] })
  public links?: Link[]

  @prop({ type: () => [Plugin], default: [] })
  public plugins?: Plugin[]

  @prop({ type: () => String, default: '0' })
  public tvlUSD!: string

  @prop({ type: () => Number, default: 0 })
  public proposalsCreated!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsExecuted!: number

  @prop({ type: () => Number, default: 0 })
  public uniqueVoters!: number

  @prop({ type: () => Number, default: 0 })
  public votes!: number

  @prop({ type: () => Boolean, default: false })
  public hideDao!: boolean

  static async create(rawData: Partial<Dao>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoIdParams) {
    const entityId = `${params.network}-${params.address}`
    return entityId
  }

  static async findExistingLog(params: IDaoIdParams, tOpts?: SaveOptions) {
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
    extraParams?: IDaoExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IDaoResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && key !== 'pluginAddress'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'id',
        'address',
        'implementationAddress',
        'creatorAddress',
        'ens',
        'name',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    if (extraParams.pluginAddress) {
      filter['plugins.address'] = extraParams.pluginAddress
    }

    filter.hideDao = { $ne: true }

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

  async update(params: Partial<Dao>, tOpts?: SaveOptions) {
    Object.entries(params)
      .filter(([key]) => key !== 'id')
      .forEach(([key, value]) => {
        if (this.schema.tree[key]) {
          if (!this.schema.tree[key].required || this.schema.tree[key].required) {
            const parsedObj = this.toObject()
            if (!_.isEqual(parsedObj[key], value)) {
              this[key] = value

              if (key === 'address') {
                this['id'] = `${this.network}-${this.address}`
              }
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
    const filtered = _.omit(obj, '_id', '__v', 'hideDao', 'createdAt', 'updatedAt')
    filtered.plugins = filtered.plugins.map((plugin: any) => _.omit(plugin, '_id', '__v'))
    return filtered
  }
}
