import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IAssetExtraParams,
  type IAssetIdParams,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = 'Asset'

@modelOptions({
  schemaOptions: {
    id: false,
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
  network: 1,
  amountUsd: -1,
})
export default class Asset extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public amount!: string

  @prop({ type: () => Number, default: 0 })
  public amountUsd!: number

  static async create(rawData: Partial<Asset>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.daoAddress, 'daoAddress is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({
        daoAddress: rawData?.daoAddress!,
        tokenAddress: rawData?.tokenAddress!,
        network: rawData?.network!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IAssetIdParams) {
    const entityId = `${params.daoAddress}-${params.tokenAddress}-${params.network}`
    return entityId
  }

  static async findExistingLog(params: IAssetIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findAssetsByDao(daoAddress: HexAddress, network: NetworksEnum) {
    return await this.find({ daoAddress, network })
  }

  static async findAssetByTokenAndDao(tokenAddress: HexAddress, daoAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ tokenAddress, daoAddress, network })
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IAssetExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<any>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_, v]) => v !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['tokenAddress']),
      ...dynamicFilter,
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        { $match: filter },
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
          $addFields: {
            token: {
              address: { $ifNull: ['$tokenDetails.address', '$tokenAddress'] },
              symbol: '$tokenDetails.symbol',
              name: '$tokenDetails.name',
              type: '$tokenDetails.type',
              logo: '$tokenDetails.logo',
              decimals: '$tokenDetails.decimals',
              priceChangeOnDayUsd: '$tokenDetails.priceChangeOnDayUsd',
              priceUsd: '$tokenDetails.priceUsd',
            },
            amountUsd: {
              $cond: {
                if: {
                  $and: [{ $gt: ['$tokenDetails.priceUsd', 0] }, { $gt: ['$tokenDetails.decimals', 0] }],
                },
                then: {
                  $multiply: [
                    { $divide: [{ $toDecimal: '$amount' }, { $pow: [10, { $toDecimal: '$tokenDetails.decimals' }] }] },
                    { $toDecimal: '$tokenDetails.priceUsd' },
                  ],
                },
                else: 0,
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            network: 1,
            daoAddress: 1,
            tokenAddress: 1,
            amount: 1,
            token: 1,
            amountUsd: { $toString: '$amountUsd' },
          },
        },
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
      ]),
      this.countDocuments(filter),
    ])

    const totalPages = Math.ceil(totalRecords / request.limit)

    if (currentPage > totalPages) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    return {
      metadata: {
        page: currentPage,
        pageSize: request.limit,
        totalPages,
        totalRecords,
      },
      data,
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
