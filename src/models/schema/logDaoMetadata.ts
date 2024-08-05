import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type ILogDaoMetadataIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogDaoMetadata'

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'logDaoMetadata',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  daoAddress: 1,
})
export default class LogDaoMetadata extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Boolean, default: null })
  public fetchedMetadata!: boolean

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public trustedForwarder!: HexAddress

  @prop({ type: () => String, default: null })
  public daoURI!: string

  @prop({ type: () => String, default: null })
  public ens!: string

  @prop({ type: () => String, default: null })
  public metadataUri!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], _id: false, default: [] })
  public links?: Link[]

  static async create(rawData: Partial<LogDaoMetadata>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      rawData.id = this.getEntityId({ transactionHash: rawData?.transactionHash!, daoAddress: rawData?.daoAddress! })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogDaoMetadataIdParams) {
    const entityId = `${params.transactionHash}-${params.daoAddress}`
    return entityId
  }

  static async findExistingLog(params: ILogDaoMetadataIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  async update(params: Partial<LogDaoMetadata>, tOpts?: SaveOptions) {
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

  static async getMetadataAtBlockNumber(daoAddress: string, blockNumber: number, network: NetworksEnum) {
    const response = await this.aggregate([
      {
        $match: {
          daoAddress,
          network,
        },
      },
      {
        $sort: {
          blockNumber: -1,
        },
      },
      {
        $match: {
          blockNumber: {
            $lte: blockNumber,
          },
        },
      },
      {
        $project: {
          name: 1,
          description: 1,
          links: 1,
          logo: '$avatar',
        },
      },
      { $limit: 1 },
    ])

    return response[0] ?? {}
  }
}
