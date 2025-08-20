import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type IRewardParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { assert } from '@errors'

const customName = ICollectionNames.CampaignReward

export class RewardStatus {
  @prop({ type: () => String, required: true })
  public claimedAmount!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number, required: true })
  public blockTimestamp!: number
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
@index({ pluginAddress: 1, network: 1, campaignId: 1 })
@index({ pluginAddress: 1, network: 1, campaignId: 1, userAddress: 1 }, { unique: true })
@index({ userAddress: 1 })
@index({ 'claims.transactionHash': 1 })
@index({ totalClaimed: 1 })
@index({ pluginAddress: 1, network: 1, campaignId: 1, totalClaimed: 1 })
@index({ pluginAddress: 1, network: 1, userAddress: 1 })
export default class CampaignReward extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public campaignId!: string

  @prop({ type: () => String, required: true })
  public userAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public amount!: string

  @prop({ type: () => String, default: '0' })
  public totalClaimed!: string

  @prop({ type: () => [RewardStatus], _id: false, default: [] })
  public claims!: RewardStatus[]

  @prop({ type: () => Array, default: null })
  public proof!: [string] | null

  @prop({ type: () => String, default: null })
  public leaf!: string | null

  static async create(rawData: Partial<CampaignReward>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.campaignId, 'campaignId is required')
      assert(!!rawData.userAddress, 'address is required')
      rawData.id = this.getEntityId({
        pluginAddress: rawData.pluginAddress!,
        network: rawData.network!,
        campaignId: rawData.campaignId!,
        userAddress: rawData.userAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IRewardParams) {
    const entityId = `${params.network}-${params.pluginAddress}-${params.campaignId}-${params.userAddress}`
    return entityId
  }

  static async findExisting(params: IRewardParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByCampaign(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    tOpts?: SaveOptions,
  ) {
    return this.find({ pluginAddress, network, campaignId }, null, tOpts)
  }

  static async findByUserAddress(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    userAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return this.find({ pluginAddress, network, userAddress }, null, tOpts)
  }

  static async findRewardForCampaign(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    userAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return this.findOne({ pluginAddress, network, campaignId, userAddress }, null, tOpts)
  }

  static async getTotalClaimedByAddress(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    userAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    const result = await this.aggregate(
      [
        {
          $match: { pluginAddress, network, userAddress },
        },
        {
          $group: {
            _id: null,
            totalClaimed: { $sum: { $toDecimal: '$totalClaimed' } },
          },
        },
      ],
      tOpts,
    )

    return result[0]?.totalClaimed?.toString() || '0'
  }

  static async getTotalClaimableByAddress(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    userAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    const result = await this.aggregate(
      [
        {
          $match: { pluginAddress, network, userAddress },
        },
        {
          $project: {
            claimable: {
              $subtract: [{ $toDecimal: '$amount' }, { $toDecimal: '$totalClaimed' }],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalClaimable: { $sum: '$claimable' },
          },
        },
      ],
      tOpts,
    )

    return result[0]?.totalClaimable?.toString() || '0'
  }

  async addClaim(
    claimedAmount: string,
    transactionHash: HexAddress,
    blockNumber: number,
    blockTimestamp: number,
    tOpts?: SaveOptions,
  ) {
    const newClaim = new RewardStatus()
    newClaim.claimedAmount = claimedAmount
    newClaim.transactionHash = transactionHash
    newClaim.blockNumber = blockNumber
    newClaim.blockTimestamp = blockTimestamp

    this.claims.push(newClaim)

    const currentTotal = BigInt(this.totalClaimed || '0')
    const claimedBigInt = BigInt(claimedAmount)
    this.totalClaimed = (currentTotal + claimedBigInt).toString()

    return await this.save(tOpts)
  }

  get isFullyClaimed(): boolean {
    return BigInt(this.totalClaimed) >= BigInt(this.amount)
  }

  get remainingAmount(): string {
    const allocated = BigInt(this.amount)
    const claimed = BigInt(this.totalClaimed)
    return (allocated - claimed).toString()
  }

  async update(params: Partial<CampaignReward>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          this[key] = value
        }
      }
    })

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }

  static async calculateTotalRewards(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    tOpts?: SaveOptions,
  ) {
    const query = [
      {
        $match: { pluginAddress, network, campaignId },
      },
      {
        $group: {
          _id: null,
          totalRewards: { $sum: { $toDecimal: '$amount' } },
        },
      },
      {
        $project: {
          totalRewards: { $toString: '$totalRewards' },
        },
      },
    ]

    const result = await this.aggregate(query, tOpts)
    return result[0]?.totalRewards?.toString() || '0'
  }

  static async getUserCampaignStatus(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    userAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    const result = await this.aggregate(
      [
        {
          $match: { pluginAddress, network, userAddress },
        },
        {
          $project: {
            claimed: { $toDecimal: '$totalClaimed' },
            unclaimed: {
              $subtract: [{ $toDecimal: '$amount' }, { $toDecimal: '$totalClaimed' }],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalClaimed: { $sum: '$claimed' },
            totalClaimable: { $sum: '$unclaimed' },
          },
        },
      ],
      tOpts,
    )

    return {
      totalClaimed: result[0]?.totalClaimed?.toString() || '0',
      totalClaimable: result[0]?.totalClaimable?.toString() || '0',
    }
  }
}
