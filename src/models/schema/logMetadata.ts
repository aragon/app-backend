import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type ILogMetadataIdParams,
  IMetadataTargetField,
  IMetadataType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.LogMetadata

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
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({ daoAddress: 1 })
@index({ network: 1, pluginAddress: 1, blockNumber: -1 })
export default class LogMetadata extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

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

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public processKey!: string

  @prop({ type: () => [String], default: [] })
  public stageNames!: string[]

  @prop({ type: () => String, enum: IMetadataType, default: IMetadataType.dao })
  public metadataType!: IMetadataType

  @prop({ type: () => String, default: null })
  static async create(rawData: Partial<LogMetadata>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')

      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILogMetadataIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}`
    return entityId
  }

  static async findExistingLog(params: ILogMetadataIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  async update(params: Partial<LogMetadata>, tOpts?: SaveOptions) {
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

  static async getLatestMetadata(
    network: NetworksEnum,
    address: HexAddress,
    key: string = IMetadataTargetField.pluginAddress,
  ) {
    const response = await this.aggregate([
      {
        $match: {
          network,
          [key]: address,
        },
      },
      {
        $sort: {
          blockNumber: -1,
        },
      },
      { $limit: 1 },
    ])

    return response[0] ?? {}
  }

  static async getMetadataAtBlockNumber(
    address: string,
    blockNumber: number,
    network: NetworksEnum,
    metadataOrigin: string = 'daoAddress',
  ) {
    const response = await this.aggregate([
      {
        $match: {
          [metadataOrigin]: address,
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
          resources: 1,
          logo: '$avatar',
          processKey: 1,
          avatar: 1,
          stageNames: 1,
        },
      },
      { $limit: 1 },
    ])

    return response[0] ?? {}
  }
}
