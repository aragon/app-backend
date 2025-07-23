import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  VotingBodyBrandIdentity,
  ICollectionNames,
  type IPaginationParams,
  type ISettingExtraParams,
  type ISettingIdParams,
  ISettingStatus,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { AggregationQueryHelper } from '@models/utils/aggregation'

const customName = ICollectionNames.Setting

export class VotingEscrowSetting {
  // Minimum amount the user can lock (set on the VE contract)
  @prop({ type: () => String, default: null })
  public minDeposit!: string

  // Minimum amount of time the NFT needs to be locked before being able to unlock the tokens (set on the ExitQueue contract)
  @prop({ type: () => Number, default: null })
  public minLockTime!: number

  // Maximum time the voting power can increase (set on the curve contract)
  @prop({ type: () => Number, default: null })
  public maxTime!: number

  // Coefficient used for calculating the increasing voting power (set on the curve contract)
  @prop({ type: () => String, default: null })
  public slope!: string

  // Coefficient used for calculating the increasing voting power (set on the curve contract)
  @prop({ type: () => String, default: null })
  public bias!: string

  // Time in seconds between unlock and withdrawal (actually not needed as the ExitQueued event already emits when the tokens can be withdrawn through the exitDate parameter)
  @prop({ type: () => Number, default: null })
  public cooldown!: number
}

export class PluginSetting {
  @prop({ type: () => String, default: null })
  public address!: HexAddress

  @prop({ type: () => Boolean, default: null })
  public isManual!: boolean

  @prop({ type: () => String, default: null })
  public allowedBody!: HexAddress

  @prop({ type: () => Number })
  public proposalType!: number

  @prop({ type: () => String, enum: VotingBodyBrandIdentity, default: VotingBodyBrandIdentity.OTHER })
  public brandId!: VotingBodyBrandIdentity
}

export class Stages {
  @prop({ type: () => Number })
  public stageIndex!: number

  @prop({ type: () => Number })
  public minAdvance!: number

  @prop({ type: () => Number })
  public maxAdvance!: number

  @prop({ type: () => Number })
  public voteDuration!: number

  @prop({ type: () => Number })
  public approvalThreshold!: number

  @prop({ type: () => Number })
  public vetoThreshold!: number

  @prop({ type: () => [PluginSetting], _id: false, default: [] })
  public plugins!: PluginSetting[]

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => Boolean, default: null })
  public cancelable!: boolean

  @prop({ type: () => Boolean, default: null })
  public editable!: boolean
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
@index({ id: 1 }, { unique: true })
@index({ pluginAddress: 1, blockNumber: 1 })
export default class Setting extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public inactiveAtBlockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ISettingStatus, required: true })
  public status!: ISettingStatus

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress // voting token address

  @prop({ type: () => VotingEscrowSetting, _id: false, default: {} })
  public votingEscrow!: VotingEscrowSetting

  // Multisig plugin
  @prop({ type: () => Boolean })
  public onlyListed!: boolean

  @prop({ type: () => Number })
  public minApprovals!: number

  // TokenVoting plugin
  @prop({ type: () => Number })
  public votingMode!: number

  @prop({ type: () => Number })
  public supportThreshold!: number

  @prop({ type: () => Number })
  public minParticipation!: number

  @prop({ type: () => Number })
  public minDuration!: number

  @prop({ type: () => String })
  public minProposerVotingPower!: string

  // SPP plugin
  @prop({ type: () => [Stages], _id: false })
  public stages!: Stages[]

  static async create(rawData: Partial<Setting>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISettingIdParams) {
    const entityId = `${params.transactionHash}-${params.pluginAddress}`
    return entityId
  }

  static async findExistingLog(params: ISettingIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findActive({
    daoAddress,
    pluginAddress,
    network,
  }: {
    pluginAddress?: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
  }) {
    const params: any = {
      status: ISettingStatus.active,
    }

    if (daoAddress) {
      params.daoAddress = daoAddress
    }

    if (pluginAddress) {
      params.pluginAddress = pluginAddress
    }

    if (network) {
      params.network = network
    }
    return await this.findOne(params).exec()
  }

  static async findLastSettingByBlockNumber(pluginAddress: HexAddress, blockNumber: number) {
    return await this.findOne({
      pluginAddress,
      blockNumber: { $lte: blockNumber },
    })
      .sort({ blockNumber: -1 })
      .exec()
  }

  static async findSetting(extraParams: ISettingExtraParams) {
    const filter: any = {}

    if (extraParams.status) {
      filter.status = extraParams.status
    }

    if (extraParams.daoAddress) {
      filter.daoAddress = extraParams.daoAddress
    }

    if (extraParams.pluginAddress) {
      filter.pluginAddress = extraParams.pluginAddress
    }

    if (extraParams.network) {
      filter.network = extraParams.network
    }

    const query: any = [
      {
        $match: filter,
      },

      // Fetch token only if settings are included and plugin has tokenAddress
      AggregationQueryHelper.token({ address: '$tokenAddress', network: '$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        totalSupply: 1,
        mintableByDao: 1,
      }),
      {
        $addFields: {
          token: {
            $cond: {
              if: { $ne: ['$tokenAddress', null] },
              then: { $arrayElemAt: ['$token', 0] },
              else: null,
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          onlyListed: 1,
          minApprovals: 1,
          votingMode: 1,
          supportThreshold: 1,
          minParticipation: 1,
          minDuration: 1,
          minProposerVotingPower: 1,
          token: 1,
          stages: 1,
        },
      },
    ]

    const results = await this.aggregate(query)
    return results?.[0]
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: ISettingExtraParams
    paginationParams?: IPaginationParams
  }) {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const dynamicFilter = Object.fromEntries(Object.entries(extraParams).filter(([_, value]) => value !== undefined))
    const filter = {
      ...ModelUtils.createFilter(paginationParams, ['pluginAddress', 'daoAddress', 'network']),
      ...dynamicFilter,
    }

    const query: any = [
      {
        $match: filter,
      },

      // Fetch token only if settings are included and plugin has tokenAddress
      AggregationQueryHelper.token({ address: '$tokenAddress', network: '$network' }, 'token', {
        _id: 0,
        network: 1,
        address: 1,
        symbol: 1,
        name: 1,
        decimals: 1,
        logo: 1,
        isGovernance: 1,
        ignoreTransfer: 1,
        hasDelegate: 1,
        underlying: 1,
        type: 1,
        totalSupply: 1,
        mintableByDao: 1,
      }),
      {
        $addFields: {
          token: {
            $cond: {
              if: { $ne: ['$tokenAddress', null] },
              then: { $arrayElemAt: ['$token', 0] },
              else: null,
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          onlyListed: 1,
          minApprovals: 1,
          votingMode: 1,
          supportThreshold: 1,
          minParticipation: 1,
          minDuration: 1,
          minProposerVotingPower: 1,
          token: 1,
        },
      },
    ]

    const currentPage = request.skip / request.limit + 1
    const aggQuery = [
      { $match: filter },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      ...query,
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery),
      this.aggregate([{ $match: filter }, ...query, { $count: 'totalRecords' }]),
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
      data,
    }
  }

  async update(params: Partial<Setting>, tOpts?: SaveOptions) {
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

  async getPlugin() {
    return await this.model('Plugin').findOne({ address: this.pluginAddress, network: this.network })
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
