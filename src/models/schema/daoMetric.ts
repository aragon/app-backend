import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IDaoMetricIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'DaoMetric'

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'daoMetric',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  daoAddress: 1,
  blockNumber: 1,
  tvlUSD: 1,
})
export default class DaoMetric extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => Number, default: 0 })
  public proposalsCreated!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsExecuted!: number

  @prop({ type: () => Number, default: 0 })
  public uniqueVoters!: number

  @prop({ type: () => Number, default: 0 })
  public votes!: number

  @prop({ type: () => Number, default: 0 })
  public members!: number

  @prop({ type: () => Number, default: 0 })
  public tvlUSD!: number

  static async create(rawData: Partial<DaoMetric>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        daoAddress: rawData?.daoAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoMetricIdParams) {
    const entityId = `${params.network}-${params.daoAddress}`
    return entityId
  }

  static async findExistingLog(params: IDaoMetricIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  async update(params: Partial<DaoMetric>, tOpts?: SaveOptions) {
    Object.entries(params)
      .filter(([key]) => key !== 'id')
      .forEach(([key, value]) => {
        if (this.schema.tree[key]) {
          if (!this.schema.tree[key].required || this.schema.tree[key].required) {
            const parsedObj = this.toObject()
            if (!_.isEqual(parsedObj[key], value)) {
              this[key] = value

              if (key === 'daoAddress' || key === 'network') {
                this['id'] = `${this.network}-${this.daoAddress}`
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
}
