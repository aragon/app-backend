import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type ENS,
  HexAddress,
  ICollectionNames,
  type IDaoExtraParams,
  type IDaoIdParams,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import ModelUtils from '@models/utils/models'
import { assert } from '@errors'

const customName = ICollectionNames.Dao

class Link {
  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public url!: string
}

class Metrics {
  @prop({ type: () => Number, default: 0 })
  public proposalsCreated!: number

  @prop({ type: () => Number, default: 0 })
  public proposalsExecuted!: number

  @prop({ type: () => Number, default: 0 })
  public uniqueVoters!: number

  @prop({ type: () => Number, default: 0 })
  public votes!: number

  @prop({ type: () => Number, default: 0 })
  public members!: number
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
@index({
  address: 1,
  blockNumber: 1,
  name: 1,
  creatorAddress: 1,
  tvlUSD: 1,
})
export default class Dao extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => Boolean, default: false })
  public isActive!: boolean

  @prop({ type: () => Boolean, default: false })
  public isHidden!: boolean

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public ens?: ENS | null

  @prop({ type: () => String, default: null })
  public subdomain!: string

  @prop({ type: () => String, default: null })
  public metadataIpfs!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null })
  public description!: string

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => [Link], _id: false, default: [] })
  public links?: Link[]

  @prop({ type: () => String, default: null })
  public daoVersion!: string

  @prop({ type: () => Number, default: 0 })
  public tvlUSD!: number

  @prop({ type: () => Metrics, _id: false, default: {} })
  public metrics?: Metrics

  static async create(rawData: Partial<Dao>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoIdParams) {
    const entityId = `${params.network}-${params.address}`
    return entityId
  }

  static async findExistingLog(params: IDaoIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IDaoExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IDaoResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && key !== 'pluginAddress'),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'address',
        'implementationAddress',
        'creatorAddress',
        'ens',
        'name',
        'subdomain',
        'transactionHash',
      ]),
      ...dynamicFilter,
    }

    if (extraParams.pluginAddress) {
      filter['plugins.address'] = extraParams.pluginAddress
    }

    filter.isHidden = { $ne: true }

    const currentPage = request.skip / request.limit + 1
    const [data, totalRecords] = await Promise.all([this.find(filter, null, request), this.countDocuments(filter)])

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
      data: data as any,
    }
  }

  async update(params: Partial<Dao>, tOpts?: SaveOptions) {
    Object.entries(params)
      .filter(([key]) => key !== 'id')
      .forEach(([key, value]) => {
        if (this.schema.tree[key]) {
          if (!this.schema.tree[key].required || this.schema.tree[key].required) {
            const parsedObj = this.toObject()
            if (!_.isEqual(parsedObj[key], value)) {
              this[key] = value

              if (key === 'address' || key === 'network') {
                this['id'] = `${this.network}-${this.address}`
              }
            }
          }
        }
      })

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', '__v', 'isHidden', 'createdAt', 'updatedAt')
    filtered.plugins = filtered.plugins.map((plugin: any) => _.omit(plugin, '_id', '__v'))
    return filtered
  }

  static async getDaoDetails(address: HexAddress) {
    const query = [
      {
        $match: {
          address,
        },
      },
      {
        $lookup: {
          from: 'Token',
          let: { tokenAddresses: '$plugins.tokenAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$tokenAddresses'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
            {
              $project: {
                network: 1,
                address: 1,
                type: 1,
                logo: 1,
                name: 1,
                symbol: 1,
                totalSupply: 1,
                holders: 1,
                decimals: 1,
              },
            },
          ],
          as: 'token',
        },
      },
      {
        $addFields: {
          token: {
            $arrayElemAt: ['$token', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'Member',
          let: { daoAddr: '$address' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $in: ['$$daoAddr', '$history.daoAddress'],
                    },
                    {
                      $in: [null, '$history.toBlockNumber'],
                    },
                  ],
                },
              },
            },
            {
              $addFields: {
                history: {
                  $arrayElemAt: ['$history', 0],
                },
              },
            },
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: [
                    '$$ROOT',
                    '$history',
                    {
                      memberAddress: '$address',
                      memberId: '$id',
                    },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                address: 1,
                ens: 1,
                lastActvity: 1,
                firstActivity: 1,
                fromBlockNumber: 1,
                fromTxHash: 1,
                fromBlockTimestamp: 1,
                network: 1,
                tokenAddress: 1,
                votingPower: 1,
                tokenBalance: 1,
              },
            },
          ],
          as: 'members',
        },
      },
      {
        $project: {
          __v: 0,
          _id: 0,
        },
      },
    ]

    const results = await this.aggregate(query)
    return results[0]
  }
}
