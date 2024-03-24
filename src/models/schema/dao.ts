import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ENS, EnumPluginType, HexAddress, type IDao, type ItxOpts, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils, { utcDateProp } from '@models/utils/models'

const customName = 'Dao'

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

class Plugin {
  @prop({ type: () => String, enum: EnumPluginType, required: true })
  public type!: EnumPluginType

  @prop({ type: () => String, required: true })
  public address!: HexAddress
}

@modelOptions({
  schemaOptions: {
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
  daoAddress: 1,
  tvlUSD: 1,
  proposalsCreated: 1,
  members: 1,
  network: 1,
  hideDao: 1,
})
export default class Dao extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: ENS

  @prop({ type: () => Number, default: 0 })
  public members!: number

  @prop({ type: () => Number, default: 0 })
  public block!: number

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => [Plugin], default: [] })
  public plugins?: Plugin[]

  @prop({ type: () => Number, required: true })
  public proposalsCreated!: number

  @prop({ type: () => Number, required: true })
  public proposalsExecuted!: number

  @prop({ type: () => Number, required: true })
  public tvlUSD!: number

  @prop({ type: () => Number, required: true })
  public uniqueVoters!: number

  @prop({ type: () => Number, required: true })
  public votes!: number

  @prop({ type: () => String, required: true })
  public txHash!: HexAddress

  @prop({ type: () => Boolean, required: true })
  public hideDao!: boolean

  @utcDateProp({ default: null })
  public lastUpdatedAt!: Date

  @prop({ type: () => [Link], default: [] })
  public links?: Link[]

  static async create(rawData: Partial<Dao>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findByDaoAddress(daoAddress: HexAddress) {
    return await this.findOne({ daoAddress })
  }

  static async findByDaoAddressAndNetwork(daoAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ daoAddress, network })
  }

  static async findWithPagination({ networks, pluginTypes }, opts: ItxOpts) {
    const params = Object.assign(
      {},
      ModelUtils.parseParams(opts, ['daoAddress', 'creatorAddress', 'ens', 'name', 'txHash']),
    )
    params.hideDao = { $ne: true }

    if (pluginTypes?.length > 0) {
      params['plugins.type'] = { $in: pluginTypes }
    }

    if (networks?.length > 0) {
      params.network = { $in: networks }
    }

    const request = Object.assign({}, ModelUtils.requestPaginate(opts))
    const currentPage = opts.offset || 1

    const [daos, totRecords] = await Promise.all([this.find(params, null, request), this.countDocuments(params)])

    const totPages = Math.ceil(totRecords / request.limit)

    if (currentPage > totPages) {
      return {
        data: [],
        totRecords: 0,
        currentPage: 1,
        totPages: 1,
      }
    }

    return {
      data: daos,
      totRecords,
      currentPage,
      totPages,
    }
  }

  async update(params: Partial<Dao>, tOpts?: SaveOptions) {
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
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    return filtered as IDao
  }
}
