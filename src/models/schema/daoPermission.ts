import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import { ALLOW_FLAG, PermissionEntityEnrichment } from '@modules/permissionEntities'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IDaoPermissionId,
  IEventLogPermission,
  type IPaginatedResult,
  type IPaginationParams,
  type IPermissionResponse,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
} from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.DaoPermission

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
@index({ event: 1, daoAddress: 1, permissionId: 1, whoAddress: 1, whereAddress: 1, type: 1 })
@index({ permissionId: 1, transactionHash: 1 })
@index({ network: 1 })
@index({ transactionHash: 1 })
export default class DaoPermission extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public permissionId!: string

  @prop({ type: () => String, required: true })
  public whoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public whereAddress!: HexAddress

  @prop({ type: () => String, enum: IEventLogPermission, required: true })
  public event!: IEventLogPermission

  @prop({ type: () => String, default: null })
  public conditionAddress?: HexAddress

  static async create(rawData: Partial<DaoPermission> = {} as Partial<DaoPermission>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        daoAddress: rawData?.daoAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IDaoPermissionId) {
    return `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.daoAddress}`
  }

  static async findExistingLog(params: IDaoPermissionId, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findPermission(
    daoAddress: HexAddress,
    network: NetworksEnum,
    permissionId: string,
  ): Promise<DaoPermission[]> {
    return this.find({
      permissionId,
      daoAddress,
      network,
    })
  }

  /**
   * Check if a DAO acknowledgement permission is currently granted (not revoked)
   * Returns the latest permission event if granted, null if revoked or not found
   */
  static async findActiveAcknowledgementPermission(
    network: NetworksEnum,
    daoAddress: HexAddress,
    whoAddress: HexAddress,
    permissionId: string,
  ): Promise<DaoPermission | null> {
    const result = await this.aggregate([
      {
        $match: {
          network,
          daoAddress,
          whoAddress,
          permissionId,
        },
      },
      { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
      { $limit: 1 },
      { $match: { event: IEventLogPermission.Granted } },
    ])
    return result?.[0] || null
  }

  async update(params: Partial<IDaoPermissionId>, tOpts?: SaveOptions) {
    const parsedObj = this.toObject()
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
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

  static async findWithPagination({
    extraParams,
    paginationParams = {},
  }: {
    extraParams: { daoAddress: HexAddress; network: NetworksEnum }
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<IPermissionResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)
    const filter = {
      daoAddress: extraParams.daoAddress,
      network: extraParams.network,
    }

    const currentPage = request.skip / request.limit + 1

    const aggQuery: any = [
      { $match: filter },
      { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
      {
        $group: {
          _id: {
            daoAddress: '$daoAddress',
            network: '$network',
            permissionId: '$permissionId',
            whoAddress: '$whoAddress',
            whereAddress: '$whereAddress',
          },
          lastEvent: { $first: '$event' },
          blockNumber: { $first: '$blockNumber' },
          transactionHash: { $first: '$transactionHash' },
          permissionId: { $first: '$permissionId' },
          whoAddress: { $first: '$whoAddress' },
          whereAddress: { $first: '$whereAddress' },
          conditionAddress: { $first: '$conditionAddress' },
          daoAddress: { $first: '$daoAddress' },
          network: { $first: '$network' },
          id: { $first: '$id' },
          createdAt: { $first: '$createdAt' },
        },
      },
      { $match: { lastEvent: IEventLogPermission.Granted } },
      { $sort: request?.sort },
      { $skip: request?.skip },
      { $limit: request?.limit },
      {
        $project: {
          _id: 0,
          daoAddress: 1,
          network: 1,
          permissionId: 1,
          whoAddress: 1,
          whereAddress: 1,
          conditionAddress: 1,
          blockNumber: 1,
          transactionHash: 1,
        },
      },
      {
        $lookup: {
          from: ICollectionNames.Plugin,
          let: { cond: { $toLower: '$conditionAddress' } },
          pipeline: [
            { $match: { daoAddress: filter.daoAddress, network: filter.network, status: IPluginStatus.installed } },
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: [{ $toLower: '$proposalCreationConditionAddress' }, '$$cond'] },
                    { $eq: [{ $toLower: '$conditionAddress' }, '$$cond'] },
                  ],
                },
              },
            },
            // deterministic tiebreak: if a condition resolves to >1 installed plugin, prefer the newest
            { $sort: { blockNumber: -1 } },
            {
              $project: {
                _id: 0,
                address: 1,
                interfaceType: 1,
                tokenAddress: 1,
                matchedProposal: { $eq: [{ $toLower: '$proposalCreationConditionAddress' }, '$$cond'] },
              },
            },
          ],
          as: 'conditionPlugin',
        },
      },
      {
        $lookup: {
          from: ICollectionNames.SelectorPermission,
          let: { cond: { $toLower: '$conditionAddress' } },
          pipeline: [
            { $match: { daoAddress: filter.daoAddress, network: filter.network, isAllowed: true } },
            { $match: { $expr: { $eq: [{ $toLower: '$conditionAddress' }, '$$cond'] } } },
            { $project: { _id: 0, selector: 1, target: 1, chainId: 1 } },
          ],
          as: 'selectorRows',
        },
      },
      {
        $lookup: {
          from: ICollectionNames.Setting,
          let: { plugin: { $first: '$conditionPlugin' } },
          pipeline: [
            { $match: { daoAddress: filter.daoAddress, network: filter.network, status: ISettingStatus.active } },
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$$plugin.matchedProposal', true] },
                    { $eq: [{ $toLower: '$pluginAddress' }, { $toLower: '$$plugin.address' }] },
                  ],
                },
              },
            },
            { $sort: { blockNumber: -1 } },
            { $project: { _id: 0, minProposerVotingPower: 1, onlyListed: 1, minApprovals: 1 } },
          ],
          as: 'proposalSetting',
        },
      },
      {
        $addFields: {
          condition: {
            $let: {
              vars: {
                pp: { $first: '$conditionPlugin' },
                ps: { $first: '$proposalSetting' },
                hasSelectorRows: { $gt: [{ $size: '$selectorRows' }, 0] },
              },
              in: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$conditionAddress', null] }, then: '$$REMOVE' },
                    {
                      case: {
                        $and: [
                          { $eq: ['$$pp.matchedProposal', true] },
                          { $eq: ['$$pp.interfaceType', IPluginInterfaceType.tokenVoting] },
                        ],
                      },
                      then: {
                        conditionType: 'voting-power',
                        token: '$$pp.tokenAddress',
                        minVotingPower: '$$ps.minProposerVotingPower',
                      },
                    },
                    {
                      case: {
                        $and: [
                          { $eq: ['$$pp.matchedProposal', true] },
                          { $eq: ['$$pp.interfaceType', IPluginInterfaceType.multisig] },
                        ],
                      },
                      then: {
                        conditionType: 'membership',
                        onlyListed: '$$ps.onlyListed',
                        minApprovals: '$$ps.minApprovals',
                      },
                    },
                    {
                      case: '$$hasSelectorRows',
                      then: {
                        conditionType: 'execute-selector',
                        selectors: '$selectorRows.selector',
                        targets: '$selectorRows.target',
                        chainIds: '$selectorRows.chainId',
                      },
                    },
                  ],
                  default: { conditionType: 'unknown' },
                },
              },
            },
          },
        },
      },
      { $addFields: { conditionAddress: { $ifNull: ['$conditionAddress', ALLOW_FLAG] } } },
      { $project: { conditionPlugin: 0, selectorRows: 0, proposalSetting: 0 } },
    ]

    const aggCountQuery: any = [
      { $match: filter },
      { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
      {
        $group: {
          _id: {
            daoAddress: '$daoAddress',
            network: '$network',
            permissionId: '$permissionId',
            whoAddress: '$whoAddress',
            whereAddress: '$whereAddress',
          },
          lastEvent: { $first: '$event' },
        },
      },
      { $match: { lastEvent: IEventLogPermission.Granted } },
      { $count: 'totalRecords' },
    ]

    const [data, totalRecords] = await Promise.all([
      this.aggregate(aggQuery).allowDiskUse(true),
      this.aggregate(aggCountQuery).allowDiskUse(true),
    ])
    const _totalRecords = totalRecords?.[0]?.totalRecords ?? 0
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
      data: await PermissionEntityEnrichment.enrich(this.db, data as IPermissionResponse[], filter),
    }
  }
}
