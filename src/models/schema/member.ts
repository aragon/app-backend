import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type ENS,
  HexAddress,
  ICollectionNames,
  type IMemberExtraParams,
  type IMemberIdParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginStatus,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import Utils from '@helpers/utils'

const customName = ICollectionNames.Member

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
  ens: 1,
})
export default class Member extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: ENS | null

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberIdParams) {
    const entityId = `${params.address}`
    return entityId
  }

  static async findExistingLog(params: IMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByEns(ens: ENS) {
    return await this.findOne({ ens })
  }

  static async findByAddress(address: HexAddress) {
    return await this.findOne({ address })
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: IMemberExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
    }

    const currentPage = request.skip / request.limit + 1

    const query = [
      { $match: filter },
      AggregationQueryHelper.daoMemberMapping(
        {
          memberAddress: '$address',
          daoAddress: extraParams.daoAddress,
          pluginAddress: extraParams.pluginAddress,
          tokenAddress: extraParams.tokenAddress,
          network: extraParams.network,
        },
        'daoMappings',
      ),
      {
        $match: {
          daoMappings: { $ne: [] },
        },
      },
      {
        $unwind: '$daoMappings',
      },
      {
        $group: {
          _id: '$_id',
          address: { $first: '$address' },
          ens: { $first: '$ens' },
          avatar: { $first: '$avatar' },
          lastActivity: { $first: '$lastActivity' },
          firstActivity: { $first: '$firstActivity' },
        },
      },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          avatar: 1,
          lastActivity: 1,
          firstActivity: 1,
        },
      },
    ]

    const aggQuery = [...query, { $sort: request?.sort }, { $skip: request?.skip }, { $limit: request?.limit }]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([...query, { $count: 'totalRecords' }]).then(results =>
        results[0] ? results[0].totalRecords : 0,
      ),
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
      data: data as any,
    }
  }

  static async findMemberByAddress(
    address: HexAddress,
    extraParams: IMemberExtraParams = {},
  ): Promise<IMembersResponse> {
    const query: any = [
      {
        $match: {
          address,
        },
      },
    ]

    if (Utils.hasPropsWithValuesExcludingNetwork(extraParams)) {
      query.push(
        AggregationQueryHelper.plugin(
          {
            daoAddress: extraParams.daoAddress,
            pluginAddress: extraParams.pluginAddress,
            network: extraParams.network,
            status: IPluginStatus.installed,
          },
          'plugin',
          {
            _id: 0,
            network: 1,
            tokenAddress: 1,
            address: 1,
          },
        ),
        {
          $addFields: {
            // Extract tokenAddress from the first plugin (if it exists)
            daoPlugin: { $arrayElemAt: ['$plugin', 0] },
          },
        },
        AggregationQueryHelper.memberBalance(
          {
            tokenAddress: '$daoPlugin.tokenAddress',
            network: '$daoPlugin.network',
            memberAddress: '$address',
          },
          'memberBalance',
          {
            amount: 1,
            votingPower: 1,
          },
        ),
        {
          $addFields: {
            memberBalance: {
              $cond: [
                { $gt: [{ $size: '$memberBalance' }, 0] },
                { $arrayElemAt: ['$memberBalance', 0] },
                { amount: null, votingPower: null },
              ],
            },
          },
        },
        AggregationQueryHelper.memberMetrics(
          {
            pluginAddress: '$daoPlugin.address',
            network: '$daoPlugin.network',
            memberAddress: '$address',
          },
          'memberMetrics',
          {
            _id: 0,
            delegateReceivedCount: 1,
            delegateSentCount: 1,
            voteCount: 1,
            proposalCount: 1,
          },
        ),
      )
    }

    query.push({
      $project: {
        _id: 0,
        address: 1,
        ens: 1,
        avatar: 1,
        lastActivity: 1,
        firstActivity: 1,
        tokenBalance: '$memberBalance.amount',
        votingPower: '$memberBalance.votingPower',
        metrics: '$memberMetrics',
      },
    })

    // {
    //   "address": "0xff486Df0bc6bc294D0d9B6C798FC8bD83c8A4B3b",
    //   "ens": null,
    //   "network": "polygon-mainnet",
    //   "fromBlockNumber": 51336069,
    //   "fromTxHash": "0xd1234573d244a6cd335b0a8c198202d33627ad686ca4aa1ae18efeada3a35aae",
    //   "pluginAddress": "0x84891a70C878B455aCdEB3d9A3653967375Cc7ca",
    //   "pluginSubdomain": "token-voting",
    //   "tokenAddress": "0x6a9E95e038fD66E4Dc16872F196E2Fdb984e0651",
    //   "daoAddress": "0x245751C08c09049D1CE56CCd33Be6ABFa168CBA1",
    //   "tokenBalance": "1000000000000000000",
    //   "votingPower": "1000000000000000000",
    //   "metrics": {
    //   "delegateReceivedCount": 1,
    //     "delegateSentCount": 0,
    //     "voteCount": 0,
    //     "proposalCount": 0
    // },
    //   "firstActivity": 0,
    //   "lastActivity": 0
    // }

    const member = await this.aggregate(query)
    return member?.[0] as IMembersResponse
  }

  async update(params: Partial<Member>, tOpts?: SaveOptions) {
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
