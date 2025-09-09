import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { assert } from '@errors'

const customName = ICollectionNames.CampaignMerkleRoot

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
@index({ pluginAddress: 1, network: 1, campaignId: 1 }, { unique: true })
@index({ pluginAddress: 1, network: 1 })
@index({ isApplied: 1 })
export default class CampaignMerkleRoot extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public campaignId!: string

  @prop({ type: () => String, required: true })
  public merkleRoot!: string

  @prop({ type: () => Number, default: 0 })
  public totalMembers!: number

  static async create(rawData: Partial<CampaignMerkleRoot>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.campaignId, 'campaignId is required')
      rawData.id = this.getEntityId({
        pluginAddress: rawData.pluginAddress!,
        network: rawData.network!,
        campaignId: rawData.campaignId!,
      })
    }

    const newDoc = new this(rawData)
    return await newDoc.save(tOpts)
  }

  static getEntityId(params: { pluginAddress: HexAddress; network: NetworksEnum; campaignId: string }) {
    const { pluginAddress, network, campaignId } = params
    return `${pluginAddress}-${network}-${campaignId}`
  }

  static async findByParams(pluginAddress: HexAddress, network: NetworksEnum, campaignId: string) {
    return await this.findOne({ pluginAddress, network, campaignId })
  }
}
