import { assert } from '@errors'
import { AggregationQueryHelper } from '@models/utils/aggregation'
import ModelUtils from '@models/utils/models'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginationParams,
  IPolicyModelType,
  IPolicySourceType,
  IPolicyStrategyType,
  type ISettingExtraParams,
  type ISettingIdParams,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

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

  // Current fee percentage charged on early exit (set on the ExitQueue contract)
  @prop({ type: () => String, default: null })
  public feePercent!: string

  // Minimum fee percentage charged on early exit (set on the ExitQueue contract)
  @prop({ type: () => String, default: null })
  public minFeePercent!: string

  // Minimum cooldown period required before exit (set on the ExitQueue contract)
  @prop({ type: () => Number, default: null })
  public minCooldown!: number

  // Fee type strategy: Fixed (0), Tiered (1), Dynamic (2) (set on the DynamicExitQueue contract)
  @prop({ type: () => Number, default: null })
  public feeType!: number
}

// Policy Source settings (embedded in PolicySetting)
export class PolicySourceSetting {
  @prop({ type: () => String, default: null })
  public address!: HexAddress

  @prop({ type: () => String, enum: IPolicySourceType, default: null })
  public type!: IPolicySourceType

  @prop({ type: () => String, default: null })
  public vaultAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  // StreamBalanceSource specific
  @prop({ type: () => String, default: null })
  public amountPerEpoch!: string

  @prop({ type: () => String, default: null })
  public maxSourceBalance!: string

  @prop({ type: () => Number, default: 0 })
  public epochInterval!: number

  @prop({ type: () => String, default: null })
  public requiredBalance!: string

  @prop({ type: () => String, default: null })
  public targetAmount!: string
}

export class PolicyModelBracket {
  @prop({ type: () => String, required: true })
  public threshold!: string

  @prop({ type: () => String, default: null })
  public routerModelAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public claimerModelAddress!: HexAddress
}

export class PolicyModelSetting {
  @prop({ type: () => String, default: null })
  public address!: HexAddress

  @prop({ type: () => String, enum: IPolicyModelType, default: null })
  public type!: IPolicyModelType

  @prop({ type: () => [String], default: [] })
  public recipients!: string[]

  @prop({ type: () => [Number], default: [] })
  public ratios!: number[]

  @prop({ type: () => String, default: null })
  public gaugeVoterAddress!: HexAddress

  @prop({ type: () => [PolicyModelBracket], _id: false, default: [] })
  public brackets!: PolicyModelBracket[]
}

export class PolicySwapSetting {
  // Target token to swap into
  @prop({ type: () => String, default: null })
  public targetTokenAddress!: HexAddress

  // CowSwap specific
  @prop({ type: () => String, default: null })
  public cowSwapSettlement!: HexAddress

  @prop({ type: () => String, default: null })
  public cowSwapRelayer!: HexAddress

  // Uniswap specific
  @prop({ type: () => String, default: null })
  public uniswapRouter!: HexAddress
}

export class PolicySetting {
  @prop({ type: () => String, default: null })
  public policyId!: string

  @prop({ type: () => String, enum: IPolicyStrategyType, default: null })
  public strategyType!: IPolicyStrategyType

  @prop({ type: () => PolicySourceSetting, _id: false, default: null })
  public source!: PolicySourceSetting

  @prop({ type: () => PolicyModelSetting, _id: false, default: null })
  public model!: PolicyModelSetting

  @prop({ type: () => PolicySwapSetting, _id: false, default: null })
  public swap!: PolicySwapSetting

  @prop({ type: () => [String], default: [] })
  public subRouters!: HexAddress[]

  @prop({ type: () => [String], default: [] })
  public subClaimers!: HexAddress[]
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

  @prop({ type: () => VotingEscrowSetting, _id: false, default: undefined })
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

  @prop({ type: () => Boolean })
  public enabledUpdatedVotingPowerHook!: boolean

  // SPP plugin
  @prop({ type: () => [Stages], _id: false })
  public stages!: Stages[]

  // Policy (Capital Router) plugin
  @prop({ type: () => PolicySetting, _id: false, default: undefined })
  public policy!: PolicySetting

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
    tokenAddress,
  }: {
    pluginAddress?: HexAddress
    daoAddress?: HexAddress
    network: NetworksEnum
    tokenAddress?: HexAddress
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

    if (tokenAddress) {
      params.tokenAddress = tokenAddress
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
          votingEscrow: 1,
          policy: 1,
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
          votingEscrow: 1,
          policy: 1,
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

  static async findByPolicySourceAddress(sourceAddress: HexAddress, network: NetworksEnum) {
    return this.findOne({
      network,
      'policy.source.address': sourceAddress,
    })
  }

  static async findByPolicyModelAddress(modelAddress: HexAddress, network: NetworksEnum) {
    return this.findOne({
      network,
      'policy.model.address': modelAddress,
    })
  }

  static async getPolicyAndSourceAddresses(pluginAddress: HexAddress, network: NetworksEnum) {
    const setting = await this.findOne({
      pluginAddress,
      network,
      status: ISettingStatus.active,
    })

    return [setting?.policy?.model?.address || null, setting?.policy?.source?.address || null]
  }
}
