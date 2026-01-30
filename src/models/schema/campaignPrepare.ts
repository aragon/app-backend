import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { CampaignPrepareProgress, CampaignPrepareStatus, HexAddress, ICollectionNames, NetworksEnum } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.CampaignPrepare

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
@index({ daoAddress: 1, network: 1 })
@index({ capitalDistributorAddress: 1, network: 1 })
@index({ status: 1 })
@index({ network: 1, status: 1 })
export default class CampaignPrepare extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public capitalDistributorAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public gaugePluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public totalAmount!: string

  @prop({ type: () => Number, default: 0 })
  public totalMembers!: number

  @prop({ type: () => String })
  public merkleRoot?: string

  @prop({ type: () => String, enum: CampaignPrepareStatus, default: CampaignPrepareStatus.pending })
  public status!: CampaignPrepareStatus

  @prop({ type: () => String, enum: CampaignPrepareProgress, default: CampaignPrepareProgress.queued })
  public progress!: CampaignPrepareProgress

  @prop({ type: () => String, required: true })
  public metadataUri!: string

  static async create(rawData: Partial<CampaignPrepare>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      assert(!!rawData.capitalDistributorAddress, 'capitalDistributorAddress is required')
      rawData.id = this.generatePrepareId({
        network: rawData.network!,
        capitalDistributorAddress: rawData.capitalDistributorAddress!,
      })
    }

    const newDoc = new this(rawData)
    return await newDoc.save(tOpts)
  }

  static generatePrepareId(params: { network: NetworksEnum; capitalDistributorAddress: HexAddress }) {
    const { network, capitalDistributorAddress } = params
    const timestamp = Date.now()
    return `prepare-${network}-${capitalDistributorAddress}-${timestamp}`
  }

  static async findByPrepareId(prepareId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: prepareId }, null, tOpts)
  }

  static async findByDao(daoAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.find({ daoAddress, network }, null, tOpts)
  }

  async update(params: Partial<CampaignPrepare>, tOpts?: SaveOptions) {
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
