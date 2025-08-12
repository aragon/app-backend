import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type ICampaignParams, ICampaignType } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { assert } from '@errors'

const customName = ICollectionNames.Campaign

export class CampaignMetadata {
  @prop({ type: () => String, default: null })
  public name?: string | null

  @prop({ type: () => String, default: null })
  public description?: string | null

  @prop({ type: () => [String], default: [] })
  public links?: string[]
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
@index({ pluginAddress: 1, network: 1, campaignId: 1 }, { unique: true })
@index({ pluginAddress: 1, network: 1 })
@index({ active: 1 })
@index({ startTime: 1, endTime: 1 })
@index({ merkleRoot: 1 })
@index({ metadataURI: 1 })
export default class Campaign extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number, required: true })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public campaignId!: string

  @prop({ type: () => String, required: true })
  public allocationStrategy!: HexAddress

  @prop({ type: () => String, required: true })
  public token!: HexAddress

  @prop({ type: () => String, required: true })
  public payoutEncoder!: HexAddress

  @prop({ type: () => Boolean, required: true })
  public multipleClaimsAllowed!: boolean

  @prop({ type: () => Number, required: true })
  public startTime!: number

  @prop({ type: () => Number, required: true })
  public endTime!: number

  @prop({ type: () => Boolean, default: true })
  public active!: boolean

  @prop({ type: () => String, enum: ICampaignType, default: null })
  public strategy?: string

  @prop({ type: () => String, default: null })
  public merkleRoot?: string | null

  @prop({ type: () => String, required: true })
  public metadataURI!: string

  @prop({ type: () => CampaignMetadata, _id: false, default: null })
  public metadata?: CampaignMetadata | null

  @prop({ type: () => Number, default: 0 })
  public claimCount!: number

  static async create(rawData: Partial<Campaign>, tOpts?: SaveOptions) {
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
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ICampaignParams) {
    const entityId = `${params.network}-${params.pluginAddress}-${params.campaignId}`
    return entityId
  }

  static async findExisting(params: ICampaignParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByPlugin(pluginAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.find({ pluginAddress, network }, null, tOpts)
  }

  static async findActiveCampaigns(pluginAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.find({ pluginAddress, network, active: true }, null, tOpts)
  }

  static async findCampaignById(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ pluginAddress, network, campaignId }, null, tOpts)
  }

  static async findByMerkleRoot(merkleRoot: string, tOpts?: SaveOptions) {
    return await this.findOne({ merkleRoot }, null, tOpts)
  }

  async updateMerkleRoot(merkleRoot: string, tOpts?: SaveOptions) {
    this.merkleRoot = merkleRoot
    return await this.save(tOpts)
  }

  async updateMetadata(
    metadata: {
      name?: string
      description?: string
      links?: string[]
      blockedCountries?: string[]
      termsConditionsUrl?: string
      enableOfacCheck?: boolean
    },
    tOpts?: SaveOptions,
  ) {
    if (!this.metadata) {
      this.metadata = new CampaignMetadata()
    }

    if (metadata.name !== undefined) this.metadata.name = metadata.name
    if (metadata.description !== undefined) this.metadata.description = metadata.description
    if (metadata.links !== undefined) this.metadata.links = metadata.links

    return await this.save(tOpts)
  }

  async update(params: Partial<Campaign>, tOpts?: SaveOptions) {
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
}
