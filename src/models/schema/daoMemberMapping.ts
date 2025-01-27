import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IDaoMemberMappingData, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

const customName = ICollectionNames.DaoMemberMapping

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
@index({
  event: 1,
  address: 1,
  tokenAddress: 1,
  pluginAddress: 1,
})
export default class DaoMemberMapping extends Model {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  static async create(rawData: Partial<DaoMemberMapping>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findMapping(
    { memberAddress, daoAddress, pluginAddress, tokenAddress, network }: IDaoMemberMappingData,
    tOpts?: SaveOptions,
  ) {
    const params: IDaoMemberMappingData = {
      memberAddress,
      daoAddress,
      pluginAddress,
      network,
    }

    if (tokenAddress) {
      params.tokenAddress = tokenAddress
    }
    return this.findOne(params, null, tOpts)
  }

  static async findAllMembersOfPlugin(
    {
      pluginAddress,
      network,
    }: {
      pluginAddress: HexAddress
      network: NetworksEnum
    },
    tOpts?: SaveOptions,
  ) {
    return await this.find({ pluginAddress, network }, null, tOpts)
  }

  async update(params: Partial<DaoMemberMapping>, tOpts?: SaveOptions) {
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

  async removeSelf(tOpts?: SaveOptions) {
    const result = await this.deleteOne({ _id: this._id }, tOpts)
    return result.deletedCount > 0
  }
}
