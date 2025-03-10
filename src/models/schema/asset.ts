import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IAssetExtraParams,
  type IAssetIdParams,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Asset

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
@index({ id: 1 }, { unique: true })
@index({ daoAddress: 1, tokenAddress: 1, network: 1, amountUsd: -1 })
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

  @prop({ type: () => Number, default: '0' })
  public amountUsd!: string

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
    return await this.findOne({ id: entityId }, null, tOpts)
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
      ...ModelUtils.createFilter(paginationParams, ['network', 'daoAddress', 'tokenAddress']),
      ...dynamicFilter,
    }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([
      this.aggregate([
        { $match: filter },
        AggregationQueryHelper.token(
          {
            network: '$network',
            address: '$tokenAddress',
          },
          'tokenDetails',
          {
            _id: 0,
            network: 1,
            address: 1,
            symbol: 1,
            name: 1,
            type: 1,
            logo: 1,
            isGovernance: 1,
            hasDelegate: 1,
            underlying: 1,
            decimals: 1,
            priceChangeOnDayUsd: 1,
            priceUsd: 1,
            mintableByDao: 1,
          },
        ),
        {
          $unwind: {
            path: '$tokenDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            amountUsd: {
              $cond: {
                if: {
                  $and: [{ $gt: ['$tokenDetails.priceUsd', 0] }, { $gt: ['$tokenDetails.decimals', 0] }],
                },
                then: {
                  $multiply: [{ $toDecimal: '$amount' }, { $toDecimal: '$tokenDetails.priceUsd' }],
                },
                else: 0,
              },
            },
          },
        },
        { $sort: request.sort },
        { $skip: request.skip },
        { $limit: request.limit },
        AggregationQueryHelper.dao(
          {
            network: '$network',
            address: '$daoAddress',
          },
          'daoInfo',
          {
            _id: 1,
            address: 1,
            ens: 1,
            avatar: 1,
          },
        ),
        {
          $addFields: {
            dao: {
              $cond: {
                if: { $gt: [{ $size: '$daoInfo' }, 0] },
                then: {
                  address: { $arrayElemAt: ['$daoInfo.address', 0] },
                  ens: { $arrayElemAt: ['$daoInfo.ens', 0] },
                  avatar: { $arrayElemAt: ['$daoInfo.avatar', 0] },
                },
                else: {
                  address: '$daoAddress',
                  ens: null,
                  avatar: null,
                },
              },
            },
          },
        },
        {
          $addFields: {
            daoInfo: '$$REMOVE',
          },
        },
        {
          $project: {
            _id: 0,
            network: 1,
            dao: !extraParams.daoAddress ? '$$REMOVE' : 1,
            amount: 1,
            token: '$tokenDetails',
            amountUsd: { $toString: '$amountUsd' },
          },
        },
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

  static async getDaoTvl(daoAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const query = [
      {
        $match: { daoAddress, network },
      },
      AggregationQueryHelper.token(
        {
          network: '$network',
          address: '$tokenAddress',
        },
        'tokenDetails',
        {
          _id: 0,
          network: 1,
          address: 1,
          priceUsd: 1,
          mintableByDao: 1,
        },
      ),
      {
        $unwind: {
          path: '$tokenDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          amountUsd: {
            $cond: {
              if: { $gt: ['$tokenDetails.priceUsd', 0] },
              then: {
                $multiply: [{ $toDecimal: '$amount' }, { $toDecimal: '$tokenDetails.priceUsd' }],
              },
              else: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          tvlUsd: { $sum: '$amountUsd' },
        },
      },
      {
        $project: {
          _id: 0,
          tvlUsd: { $round: [{ $toDouble: '$tvlUsd' }, 2] },
        },
      },
    ]
    const aggregate = this.aggregate(query)
    if (tOpts?.session) {
      aggregate.session(tOpts.session)
    }
    const response = await aggregate
    return Number(response[0]?.tvlUsd || 0)
  }

  async update(params: Partial<Asset>, tOpts?: SaveOptions) {
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
