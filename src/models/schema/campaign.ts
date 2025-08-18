import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  NetworksEnum,
  type ICampaignParams,
  ICampaignType,
  type IPaginationParams,
  type IPaginatedResult,
  type ICampaignResponse,
  IClaimStat,
  type ICampaignApiParams,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'

const customName = ICollectionNames.Campaign

export class CampaignMetadata {
  @prop({ type: () => String, default: null })
  public title?: string | null

  @prop({ type: () => String, default: null })
  public description?: string | null

  @prop({ type: () => [String], default: [] })
  public resources?: string[]
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
@index({ pluginAddress: 1, network: 1, campaignId: 1 }, { unique: true })
@index({ pluginAddress: 1, network: 1 })
@index({ active: 1 })
@index({ startTime: 1, endTime: 1 })
@index({ merkleRoot: 1 })
@index({ metadataURI: 1 })
@index({ 'metadata.title': 'text', 'metadata.description': 'text' })
@index({ pluginAddress: 1, network: 1, active: 1 })
@index({ claimCount: 1 })
export default class Campaign extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number, required: true })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public campaignId!: string

  @prop({ type: () => String, required: true })
  public allocationStrategy!: HexAddress

  @prop({ type: () => String, required: true })
  public token!: HexAddress

  @prop({ type: () => String, required: true })
  public payoutEncoder!: HexAddress

  @prop({ type: () => Boolean, required: true })
  public multipleClaimsAllowed!: boolean

  @prop({ type: () => Number, required: true })
  public startTime!: number

  @prop({ type: () => Number, required: true })
  public endTime!: number

  @prop({ type: () => Boolean, default: true })
  public active!: boolean

  @prop({ type: () => String, enum: ICampaignType, default: null })
  public strategy?: string

  @prop({ type: () => String, default: null })
  public merkleRoot?: string | null

  @prop({ type: () => String, required: true })
  public metadataURI!: string

  @prop({ type: () => CampaignMetadata, _id: false, default: null })
  public metadata?: CampaignMetadata | null

  @prop({ type: () => Number, default: 0 })
  public claimCount!: number

  static async create(rawData: Partial<Campaign>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.campaignId, 'campaignId is required')
      rawData.id = this.getEntityId({
        pluginAddress: rawData.pluginAddress!,
        network: rawData.network!,
        campaignId: rawData.campaignId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ICampaignParams) {
    const entityId = `${params.network}-${params.pluginAddress}-${params.campaignId}`
    return entityId
  }

  static async findExisting(params: ICampaignParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findCampaignById(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    campaignId: string,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ pluginAddress, network, campaignId }, null, tOpts)
  }

  async updateMerkleRoot(merkleRoot: string, tOpts?: SaveOptions) {
    this.merkleRoot = merkleRoot
    return await this.save(tOpts)
  }

  async incrementClaimCount(tOpts?: SaveOptions) {
    this.claimCount = (this.claimCount || 0) + 1
    return await this.save(tOpts)
  }

  async updateMetadata(
    metadata: {
      title?: string
      description?: string
      resources?: string[]
    },
    tOpts?: SaveOptions,
  ) {
    if (!this.metadata) {
      this.metadata = new CampaignMetadata()
    }

    if (metadata.title !== undefined) this.metadata.title = metadata.title
    if (metadata.description !== undefined) this.metadata.description = metadata.description
    if (metadata.resources !== undefined) this.metadata.resources = metadata.resources

    return await this.save(tOpts)
  }

  async update(params: Partial<Campaign>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          this[key] = value
        }
      }
    })

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }

  static async getCampaignsWithPagination({
    paginationParams = {},
    params = {},
  }: {
    paginationParams?: IPaginationParams
    params?: ICampaignApiParams
  }): Promise<IPaginatedResult<ICampaignResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const baseFilter: any = {}
    if (params.pluginAddress) baseFilter.pluginAddress = params.pluginAddress
    if (params.network) baseFilter.network = params.network

    const pipeline: any[] = []

    pipeline.push({ $match: baseFilter })

    if (params.userAddress) {
      pipeline.push({
        $lookup: {
          from: ICollectionNames.CampaignReward,
          let: {
            campaignPlugin: '$pluginAddress',
            campaignNetwork: '$network',
            campaignId: '$campaignId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$pluginAddress', '$$campaignPlugin'] },
                    { $eq: ['$network', '$$campaignNetwork'] },
                    { $eq: ['$campaignId', '$$campaignId'] },
                    { $eq: ['$userAddress', params.userAddress] },
                  ],
                },
              },
            },
          ],
          as: 'userReward',
        },
      })

      if (params.status) {
        if (params.status === IClaimStat.CLAIMED) {
          pipeline.push({
            $match: {
              $and: [
                { userReward: { $not: { $size: 0 } } }, // Must have reward records
                {
                  $expr: {
                    $eq: [
                      { $arrayElemAt: ['$userReward.totalClaimed', 0] },
                      { $arrayElemAt: ['$userReward.amount', 0] },
                    ],
                  },
                },
              ],
            },
          })
        } else if (params.status === IClaimStat.CLAIMABLE) {
          pipeline.push({
            $match: {
              $or: [
                { userReward: { $size: 0 } },
                {
                  $expr: {
                    $ne: [
                      { $arrayElemAt: ['$userReward.totalClaimed', 0] },
                      { $arrayElemAt: ['$userReward.amount', 0] },
                    ],
                  },
                },
              ],
            },
          })
        }
      }
    }

    const searchFilter = ModelUtils.createFilter(paginationParams, ['metadata.title', 'metadata.description'])
    if (Object.keys(searchFilter).length > 0) {
      pipeline.push({ $match: searchFilter })
    }

    pipeline.push(
      {
        $lookup: {
          from: ICollectionNames.Token,
          let: {
            campaignToken: '$token',
            campaignNetwork: '$network',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$campaignToken'] }, { $eq: ['$network', '$$campaignNetwork'] }],
                },
              },
            },
            {
              $project: {
                address: 1,
                name: 1,
                symbol: 1,
                decimals: 1,
                priceUsd: 1,
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
    )

    const projectStage: any = {
      campaignId: '$campaignId',
      title: { $ifNull: ['$metadata.title', ''] },
      description: { $ifNull: ['$metadata.description', ''] },
      type: { $ifNull: ['$metadata.type', ''] },
      resources: { $ifNull: ['$metadata.resources', null] },
      claimCount: '$claimCount',
      token: {
        address: '$token.address',
        network: '$token.network',
        symbol: '$token.symbol',
        name: '$token.name',
        decimals: '$token.decimals',
        priceUsd: '$token.priceUsd',
      },
      startTime: '$startTime',
      endTime: '$endTime',
      active: '$active',
      multipleClaimsAllowed: '$multipleClaimsAllowed',
      strategy: {
        root: { $ifNull: ['$merkleRoot', ''] },
      },
    }

    // Only include the userData field if userAddress was provided (which means userReward lookup was added)
    if (params.userAddress) {
      projectStage.userData = {
        $cond: {
          if: { $gt: [{ $size: '$userReward' }, 0] },
          then: {
            status: {
              $cond: {
                if: {
                  $eq: [{ $arrayElemAt: ['$userReward.totalClaimed', 0] }, { $arrayElemAt: ['$userReward.amount', 0] }],
                },
                then: IClaimStat.CLAIMED,
                else: IClaimStat.CLAIMABLE,
              },
            },
            claims: {
              $map: {
                input: { $arrayElemAt: ['$userReward.claims', 0] },
                as: 'claim',
                in: {
                  amount: '$$claim.claimedAmount',
                  transactionHash: '$$claim.transactionHash',
                  blockNumber: '$$claim.blockNumber',
                  blockTimestamp: '$$claim.blockTimestamp',
                },
              },
            },
            proofs: { $arrayElemAt: ['$userReward.proof', 0] },
            leaf: { $arrayElemAt: ['$userReward.leaf', 0] },
            totalAmount: { $arrayElemAt: ['$userReward.amount', 0] },
            totalClaimed: { $arrayElemAt: ['$userReward.totalClaimed', 0] },
          },
          else: {
            status: IClaimStat.CLAIMABLE,
            claims: [],
            totalAmount: '0',
            totalClaimed: '0',
          },
        },
      }
    }

    pipeline.push({ $project: projectStage })

    pipeline.push({ $sort: request.sort })
    pipeline.push({ $skip: request.skip })
    pipeline.push({ $limit: request.limit })

    const countPipeline = [
      { $match: baseFilter },
      ...(params.userAddress
        ? [
            {
              $lookup: {
                from: ICollectionNames.CampaignReward,
                let: {
                  campaignPlugin: '$pluginAddress',
                  campaignNetwork: '$network',
                  campaignId: '$campaignId',
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$pluginAddress', '$$campaignPlugin'] },
                          { $eq: ['$network', '$$campaignNetwork'] },
                          { $eq: ['$campaignId', '$$campaignId'] },
                          { $eq: ['$userAddress', params.userAddress] },
                        ],
                      },
                    },
                  },
                ],
                as: 'userReward',
              },
            },
          ]
        : []),
      ...(params.status && params.userAddress
        ? [
            {
              $match:
                params.status === IClaimStat.CLAIMED
                  ? {
                      $and: [
                        { userReward: { $not: { $size: 0 } } }, // Must have reward records
                        {
                          $expr: {
                            $eq: [
                              { $arrayElemAt: ['$userReward.totalClaimed', 0] },
                              { $arrayElemAt: ['$userReward.amount', 0] },
                            ],
                          },
                        },
                      ],
                    }
                  : {
                      $or: [
                        { userReward: { $size: 0 } },
                        {
                          $expr: {
                            $ne: [
                              { $arrayElemAt: ['$userReward.totalClaimed', 0] },
                              { $arrayElemAt: ['$userReward.amount', 0] },
                            ],
                          },
                        },
                      ],
                    },
            },
          ]
        : []),
      ...(Object.keys(searchFilter).length > 0 ? [{ $match: searchFilter }] : []),
      { $count: 'total' },
    ]

    const [data, totalResult] = await Promise.all([this.aggregate(pipeline), this.aggregate(countPipeline)])

    const totalRecords = totalResult[0]?.total || 0
    const currentPage = request.skip / request.limit + 1
    const totalPages = Math.ceil(totalRecords / request.limit)

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
}
