import { assert } from '@errors'
import Utils from '@helpers/utils'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
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
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

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
@index({ memberAddress: 1 })
@index({ address: 1, ens: 1 })
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
    return `${params.address}`
  }

  static async findExistingLog(params: IMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByEns(ens: ENS, tOpts?: SaveOptions) {
    return await this.findOne({ ens }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ address }, null, tOpts)
  }

  static async findPaginatedMembersOnly({
    paginationParams = {},
  }: {
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['address', 'ens']),
    }

    const currentPage = request.skip / request.limit + 1
    const query: any = [{ $match: filter }]

    const aggQuery = [
      ...query,
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      {
        $project: {
          _id: 0,
          address: 1,
          ens: 1,
          avatar: 1,
          firstActivity: 1,
          lastActivity: 1,
        },
      },
    ]

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
            transactionHash: 1,
            blockTimestamp: 1,
            tokenAddress: 1,
            name: 1,
            description: 1,
            processKey: 1,
            slug: 1,
            links: 1,
            address: 1,
            implementationAddress: 1,
            enableOfacCheck: 1,
            blockedCountries: 1,
            termsConditionsUrl: 1,
            isSupported: 1,
            interfaceType: 1,
            conditionAddress: 1,
            lockManagerAddress: 1,
            subdomain: 1,
            isProcess: 1,
            proposalCreationConditionAddress: 1,
            isBody: 1,
            isSubPlugin: 1,
            totalStages: 1,
            subPlugins: 1,
            stageIndex: 1,
            parentPlugin: 1,
          },
        ),
        {
          $addFields: {
            // Extract tokenAddress from the first plugin (if it exists)
            daoPlugin: { $arrayElemAt: ['$plugin', 0] },
          },
        },
        AggregationQueryHelper.pluginMetrics(
          {
            pluginAddress: '$daoPlugin.address',
            network: '$daoPlugin.network',
            memberAddress: '$address',
          },
          'pluginMetrics',
          {
            voteCount: 1,
            proposalCount: 1,
            firstActivity: 1,
            lastActivity: 1,
          },
        ),
        {
          $addFields: {
            pluginMetrics: {
              $cond: {
                if: { $gt: [{ $size: '$pluginMetrics' }, 0] },
                then: { $arrayElemAt: ['$pluginMetrics', 0] },
                else: {
                  voteCount: 0,
                  proposalCount: 0,
                  firstActivity: null,
                  lastActivity: null,
                },
              },
            },
          },
        },
        AggregationQueryHelper.tokenMember(
          {
            tokenAddress: '$daoPlugin.tokenAddress',
            network: '$daoPlugin.network',
            memberAddress: '$address',
          },
          'tokenMember',
          {
            votingPower: 1,
            delegateReceivedCount: 1,
          },
        ),
        {
          $addFields: {
            tokenMember: {
              $cond: {
                if: { $gt: [{ $size: '$tokenMember' }, 0] },
                then: { $arrayElemAt: ['$tokenMember', 0] },
                else: {
                  votingPower: null,
                  delegateReceivedCount: 0,
                },
              },
            },
          },
        },
        AggregationQueryHelper.token(
          {
            address: '$daoPlugin.tokenAddress',
            network: '$daoPlugin.network',
          },
          'token',
          {
            hasDelegate: 1,
            isGovernance: 1,
            ignoreTransfer: 1,
          },
        ),
        {
          $addFields: {
            hasDelegate: { $ifNull: [{ $arrayElemAt: ['$token.hasDelegate', 0] }, false] },
            isGovernance: { $ifNull: [{ $arrayElemAt: ['$token.isGovernance', 0] }, false] },
          },
        },
      )
    }

    query.push({
      $project: {
        _id: 0,
        address: 1,
        ens: 1,
        avatar: 1,
        firstActivity: 1,
        lastActivity: 1,
        votingPower: '$tokenMember.votingPower',
        metrics: {
          lastActivity: '$pluginMetrics.lastActivity',
          firstActivity: '$pluginMetrics.firstActivity',
          delegateReceivedCount: '$tokenMember.delegateReceivedCount',
          voteCount: '$pluginMetrics.voteCount',
          proposalCount: '$pluginMetrics.proposalCount',
        },
        isGovernance: '$isGovernance',
        hasDelegate: '$hasDelegate',
      },
    })

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
