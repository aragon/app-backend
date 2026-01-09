import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.PluginSlug

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
// validation for unique slug in a DAO
@index({ daoAddress: 1, slug: 1, network: 1 }, { unique: true })
export default class PluginSlug extends Model {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public slug!: string

  static async create(rawData: Partial<PluginSlug>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findExistingSlugInDao(daoAddress: HexAddress, slug: string, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ daoAddress, slug, network }, null, tOpts)
  }

  static async findPluginSlug(
    pluginAddress: HexAddress,
    daoAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ pluginAddress, daoAddress, network }, null, tOpts)
  }

  static async deletePluginSlug(
    daoAddress: HexAddress,
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<boolean> {
    const deletionResult = await this.deleteOne({ daoAddress, pluginAddress, network })
    return deletionResult.deletedCount === 1
  }

  async update(params: Partial<PluginSlug>, tOpts?: SaveOptions) {
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
