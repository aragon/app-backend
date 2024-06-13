import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IPaginatedResult, type IPaginationParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Asset'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'asset',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  daoAddress: 1,
  tokenAddress: 1,
})
export default class Asset extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress | string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  static async create(rawData: Partial<Asset>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.daoAddress, 'daoAddress is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.network, 'network is required')
      rawData.entityId = this.getEntityId(rawData?.daoAddress!, rawData?.tokenAddress! as HexAddress, rawData?.network!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(daoAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum) {
    const entityId = `${daoAddress}-${tokenAddress}-${network}`
    return entityId
  }

  static async findExistingLog(
    daoAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    const entityId = this.getEntityId(daoAddress, tokenAddress, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  static async findAssetsByDao(daoAddress: HexAddress, network: NetworksEnum) {
    return await this.find({ daoAddress, network })
  }

  static async findAssetByTokenAndDao(tokenAddress: HexAddress, daoAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ tokenAddress, daoAddress, network })
  }

  static async findWithPagination({ daoAddress }, opts: IPaginationParams = {}): Promise<IPaginatedResult<any>> {
    const request = Object.assign({}, ModelUtils.requestPaginate(opts, { orderProp: opts.orderProp }))

    const matchStage: any = {}

    if (daoAddress) {
      matchStage.daoAddress = daoAddress
    }

    const totalCount = await this.countDocuments(matchStage)
    const totalPages = Math.ceil(totalCount / request.limit)

    const result = await this.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'token',
          localField: 'tokenAddress',
          foreignField: 'address',
          as: 'tokenDetails',
        },
      },
      {
        $unwind: {
          path: '$tokenDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          entityId: '$entityId',
          network: 1,
          daoAddress: 1,
          tokenAddress: 1,
          amount: 1,
          token: {
            address: '$tokenDetails.address',
            symbol: '$tokenDetails.symbol',
            name: '$tokenDetails.name',
            type: '$tokenDetails.type',
            logo: '$tokenDetails.logo',
            decimals: '$tokenDetails.decimals',
            priceChangeOnDayUsd: '$tokenDetails.priceChangeOnDayUsd',
            priceUsd: '$tokenDetails.priceUsd',
          },
        },
      },
      {
        $addFields: {
          amountUsd: {
            $cond: {
              if: {
                $and: ['$token.priceUsd', { $gt: ['$token.decimals', null] }],
              },
              then: {
                $multiply: [
                  {
                    $divide: [{ $toDecimal: '$amount' }, { $pow: [10, { $toDecimal: '$token.decimals' }] }],
                  },
                  { $toDecimal: '$token.priceUsd' },
                ],
              },
              else: 0,
            },
          },
        },
      },
      { $sort: request.sort },
      { $skip: request.skip },
      { $limit: request.limit },
      {
        $project: {
          network: 1,
          daoAddress: 1,
          tokenAddress: 1,
          amount: 1,
          token: 1,
          amountUsd: { $toString: '$amountUsd' },
        },
      },
    ])

    return {
      metadata: {
        limit: request.limit,
        skip: request.skip,
        order: opts.order,
        orderProp: opts.orderProp,
        currentPage: request.skip / request.limit + 1,
        totPages: totalPages,
        totRecords: totalCount,
      },
      data: result,
    }
  }

  async update(params: Partial<Plugin>, tOpts?: SaveOptions) {
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
