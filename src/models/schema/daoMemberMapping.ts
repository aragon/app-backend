import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IDaoExtraParams,
  type IPaginationParams,
  IPluginStatus,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

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

  static async findTransferByMemberWithPagination({
    extraParams,
    paginationParams,
  }: {
    extraParams?: IDaoExtraParams
    paginationParams?: IPaginationParams
  }) {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const currentPage = request.skip / request.limit + 1

    const filter: any[] = []

    if (extraParams?.memberAddress) {
      filter.push({ $eq: ['$memberAddress', extraParams?.memberAddress] })
    }

    if (extraParams?.network) {
      filter.push({ $eq: ['$network', extraParams?.network] })
    }

    const query = [
      {
        $match: {
          $expr: {
            $and: filter,
          },
        },
      },
      {
        $project: {
          daoAddress: 1,
          _id: 0,
        },
      },
      AggregationQueryHelper.dao(
        {
          address: '$daoAddress',
        },
        'daoDetails',
      ),
      {
        $unwind: {
          path: '$daoDetails',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $replaceRoot: {
          newRoot: '$daoDetails',
        },
      },
      {
        $project: {
          createdAt: 0,
          updatedAt: 0,
          isHidden: 0,
          isActive: 0,
          __v: 0,
          _id: 0,
        },
      },
      ...(extraParams?.excludedDao?.daoAddress && extraParams?.excludedDao?.network
        ? [
            {
              $match: {
                $nor: [
                  {
                    address: extraParams.excludedDao.daoAddress,
                    network: extraParams.excludedDao.network,
                  },
                ],
              },
            },
          ]
        : []),
      AggregationQueryHelper.member(
        {
          memberAddress: '$creatorAddress',
        },
        'creator',
      ),
      {
        $addFields: {
          creator: {
            $cond: {
              if: { $gt: [{ $size: '$creator' }, 0] },
              then: {
                address: { $arrayElemAt: ['$creator.address', 0] },
                ens: { $arrayElemAt: ['$creator.ens', 0] },
                avatar: { $arrayElemAt: ['$creator.avatar', 0] },
              },
              else: {
                address: '$creatorAddress',
                ens: null,
                avatar: null,
              },
            },
          },
        },
      },
      {
        $addFields: {
          creatorAddress: '$$REMOVE',
        },
      },
      AggregationQueryHelper.plugin(
        {
          daoAddress: '$address',
          network: '$network',
          status: IPluginStatus.installed,
        },
        'plugins',
        {
          _id: 0,
          transactionHash: 1,
          blockTimestamp: 1,
          name: 1,
          description: 1,
          processKey: 1,
          links: 1,
          address: 1,
          implementationAddress: 1,
          isSupported: 1,
          interfaceType: 1,
          // status: 1,
          release: 1,
          build: 1,
          subdomain: 1,
          isProcess: 1,
          isBody: 1,
          isSubPlugin: 1,
          totalStages: 1,
          subPlugins: 1,
          stageIndex: 1,
          parentPlugin: 1,
        },
        {
          settings: true,
          token: true,
        },
      ),
    ]

    const aggQuery = [{ $sort: request?.sort }, { $skip: request?.skip }, { $limit: request?.limit }, ...query]

    const [result, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([...query, { $count: 'totalRecords' }]),
    ])

    const _totalRecords = totalRecords && totalRecords.length === 1 ? totalRecords[0].totalRecords : 0
    const totalPages = Math.ceil(_totalRecords / request.limit)

    if (currentPage > totalPages) {
      return ModelUtils.paginateEmptyResponse(request.limit)
    }

    return {
      metadata: {
        page: currentPage,
        pageSize: request.limit,
        totalPages,
        totalRecords: _totalRecords,
      },
      data: result as any,
    }
  }

  static async findMapping(
    {
      memberAddress,
      daoAddress,
      pluginAddress,
      network,
    }: {
      memberAddress: HexAddress
      daoAddress: HexAddress
      pluginAddress: HexAddress
      network: NetworksEnum
    },
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ memberAddress, daoAddress, pluginAddress, network }, null, tOpts)
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
