import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, type IDaoPermissionId, IEventLogPermission, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { assert } from '@errors'
import * as _ from 'lodash'

const customName = ICollectionNames.DaoPermission

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
@index({ id: 1 }, { unique: true })
@index({ event: 1, daoAddress: 1, permissionId: 1, whoAddress: 1, whereAddress: 1, type: 1 })
@index({ permissionId: 1, transactionHash: 1 })
@index({ network: 1 })
export default class DaoPermission extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public permissionId!: string

  @prop({ type: () => String, required: true })
  public whoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public whereAddress!: HexAddress

  @prop({ type: () => String, enum: IEventLogPermission, required: true })
  public event!: IEventLogPermission

  @prop({ type: () => String, default: null })
  public conditionAddress?: HexAddress

  static async create(rawData: Partial<DaoPermission>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        daoAddress: rawData?.daoAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoPermissionId) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.daoAddress}`
  }

  static async findExistingLog(params: IDaoPermissionId, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findPermission(
    daoAddress: HexAddress,
    network: NetworksEnum,
    permissionId: string,
  ): Promise<DaoPermission[]> {
    return this.find({
      permissionId,
      daoAddress,
      network,
    })
  }

  async update(params: Partial<IDaoPermissionId>, tOpts?: SaveOptions) {
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
