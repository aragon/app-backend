import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.EpochReward

export class EpochRewardEntry {
  @prop({ type: () => String, required: true })
  public address!: string

  @prop({ type: () => String, required: true })
  public amount!: string
}

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
@index({ pluginAddress: 1, network: 1, epochId: 1 }, { unique: true })
@index({ campaignId: 1 })
@index({ capitalDistributorAddress: 1, network: 1 })
export default class EpochReward extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public capitalDistributorAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, required: true })
  public epochId!: number

  @prop({ type: () => String, required: true })
  public rewardTotalAmount!: string

  @prop({ type: () => String, default: null })
  public campaignId!: string | null

  @prop({ type: () => [EpochRewardEntry], _id: false, default: [] })
  public rewards!: EpochRewardEntry[]

  static getEntityId(params: {
    network: NetworksEnum
    pluginAddress: HexAddress
    epochId: number
    capitalDistributorAddress: HexAddress
  }) {
    return `${params.network}-${params.pluginAddress}-${params.capitalDistributorAddress}-${params.epochId}`
  }

  static async create(rawData: Partial<EpochReward>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.network, 'network is required')
      assert(rawData.epochId !== undefined, 'epochId is required')
      assert(!!rawData.capitalDistributorAddress, 'capitalDistributorAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        pluginAddress: rawData.pluginAddress!,
        epochId: rawData.epochId!,
        capitalDistributorAddress: rawData.capitalDistributorAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findByEpoch(
    pluginAddress: HexAddress,
    capitalDistributorAddress: HexAddress,
    network: NetworksEnum,
    epochId: number,
    tOpts?: SaveOptions,
  ) {
    return this.findOne({ pluginAddress, capitalDistributorAddress, network, epochId }, null, tOpts)
  }

  static async findByCampaignId(
    capitalDistributorAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    tOpts?: SaveOptions,
  ) {
    return this.findOne({ capitalDistributorAddress, network, campaignId }, null, tOpts)
  }

  async update(params: Partial<EpochReward>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          this[key] = value
        }
      }
    })

    return await this.save(tOpts)
  }

  static async getActiveCampaignIds(
    pluginAddress: HexAddress,
    capitalDistributorAddress: HexAddress,
    network: NetworksEnum,
  ) {
    return this.distinct('campaignId', {
      pluginAddress,
      capitalDistributorAddress,
      network,
      campaignId: { $ne: null },
    })
  }

  static async getCumulativeRewardsMap(
    pluginAddress: HexAddress,
    capitalDistributorAddress: HexAddress,
    network: NetworksEnum,
  ) {
    return this.aggregate([
      { $match: { pluginAddress, capitalDistributorAddress, network } },
      { $unwind: '$rewards' },
      { $group: { _id: '$rewards.address', total: { $sum: { $toDecimal: '$rewards.amount' } } } },
      { $project: { _id: 0, address: '$_id', total: 1 } },
    ])
  }
}
