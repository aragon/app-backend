import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  ITokenType,
  type ITransactionExtraParams,
  type ITransactionIdParams,
  type ITransactionResponse,
  ITransactionSide,
  NetworksEnum,
} from '@types'
import { ITransactionType } from '@src/types/transfer'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import utils from '@helpers/utils'
import logger from '@logger'

const customName = ICollectionNames.Transaction

class ERC1155Metadata {
  @prop({ type: () => String, default: null })
  public tokenId!: string

  @prop({ type: () => String, default: null })
  public value!: string
}

class Snapshot {
  // transaction price at specific block
  @prop({ type: () => String, default: null })
  public priceUsd!: string

  @prop({ type: () => Number, default: 0 })
  public priceUpdatedAt!: number
}

class Token {
  @prop({ type: () => String, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITokenType, required: true })
  public type!: ITokenType

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public logo!: string | null

  @prop({ type: () => String, default: null })
  public name!: string | null

  @prop({ type: () => String, default: null, uppercase: true })
  public symbol!: string | null

  @prop({ type: () => Number, default: 18 })
  public decimals!: number

  @prop({ type: () => Snapshot, _id: false, default: {} })
  public snapshot!: Snapshot
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
@index({ fromAddress: 1, toAddress: 1, tokenAddress: 1, daoAddress: 1 })
@index({ id: -1, blockNumber: -1, network: 1, daoAddress: 1 })
@index({ blockNumber: -1 })
export default class Transaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITransactionSide, required: true })
  public side!: ITransactionSide // deposit or withdraw

  @prop({ type: () => String, enum: ITransactionType, required: true })
  public type!: ITransactionType // native, erc20, or erc721

  @prop({ type: () => String, required: true })
  public fromAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public toAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public value!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => Number, default: null })
  public logIndex!: number | null

  @prop({ type: () => Number, default: null })
  public transactionIndex!: number | null

  @prop({ type: () => String, default: null })
  public tokenId!: string | null

  @prop({ type: () => String, default: null })
  public erc721TokenId!: string | null

  @prop({ type: () => [ERC1155Metadata], _id: false, default: [] })
  public erc1155Metadata!: ERC1155Metadata[]

  @prop({ type: () => String, default: null })
  public proposalIndex!: string | null

  @prop({ type: () => Number, default: null })
  public actionIndex!: number | null

  @prop({ type: () => Token, _id: false, default: null })
  public token?: Token

  @prop({ type: () => String, default: '0' })
  public amountUsd!: string

  static async create(rawData: Partial<Transaction>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.daoAddress, 'daoAddress is required')

      // Determine transaction type based on tokenId and tokenAddress
      let type: ITransactionIdParams['type'] = ITransactionType.native
      if (rawData.tokenId || rawData.erc721TokenId) {
        type = ITransactionType.erc721
      } else if (rawData.tokenAddress && rawData.tokenAddress !== utils.zeroAddress) {
        type = ITransactionType.erc20
      }

      const idParams = {
        transactionHash: rawData.transactionHash!,
        network: rawData.network!,
        daoAddress: rawData.daoAddress!,
        type,
        logIndex: rawData.logIndex || undefined,
        transactionIndex: rawData.transactionIndex || undefined,
        tokenAddress: rawData.tokenAddress || undefined,
        tokenId: rawData.tokenId || rawData.erc721TokenId || undefined,
        proposalId: rawData.proposalIndex || undefined,
        actionIndex:
          rawData.actionIndex !== undefined && rawData.actionIndex !== null ? rawData.actionIndex : undefined,
      }

      // Debug log for batch native transfers
      if (type === ITransactionType.native && rawData.actionIndex !== undefined) {
        logger.verbose('Creating native transfer with actionIndex', {
          txHash: rawData.transactionHash,
          actionIndex: rawData.actionIndex,
          idParams,
        })
      }

      rawData.id = this.getEntityId(idParams)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ITransactionIdParams) {
    const { transactionHash: txHash, type, daoAddress, network } = params
    const { logIndex, transactionIndex, tokenAddress, tokenId, actionIndex } = params

    switch (type) {
      case ITransactionType.erc20:
        // Format: daoAddress-network-txHash-logIndex-erc20-tokenAddress
        return `${daoAddress}-${network}-${txHash}-${logIndex ?? transactionIndex ?? 0}-erc20${
          tokenAddress ? `-${tokenAddress}` : ''
        }`

      case ITransactionType.native:
        // Format: daoAddress-network-txHash-native or with actionIndex for batch
        // If actionIndex is present, it's a native transfer from a batch Executed event
        if (actionIndex !== undefined && actionIndex !== null) {
          const idWithAction = `${daoAddress}-${network}-${txHash}-native-action${actionIndex}`
          return idWithAction
        }
        return `${daoAddress}-${network}-${txHash}-native`

      case ITransactionType.erc721:
        // Format: daoAddress-network-txHash-logIndex-nft-tokenAddress-tokenId
        return `${daoAddress}-${network}-${txHash}-${logIndex ?? transactionIndex ?? 0}-nft-${tokenAddress}-${tokenId}`

      default:
        // Fallback format
        return `${daoAddress}-${network}-${txHash}-${logIndex ?? transactionIndex ?? 0}-${type}`
    }
  }

  static async findExistingLog(params: Partial<ITransactionIdParams>, tOpts?: SaveOptions) {
    // If we have enough info to generate the ID, use that
    if (params.transactionHash && params.network && params.daoAddress && params.type) {
      // For native transactions with actionIndex, we must check for the specific batch transaction
      if (params.type === ITransactionType.native && params.actionIndex !== undefined && params.actionIndex !== null) {
        const batchEntityId = this.getEntityId({
          transactionHash: params.transactionHash,
          network: params.network,
          daoAddress: params.daoAddress,
          type: params.type,
          actionIndex: params.actionIndex,
        })
        logger.verbose('Looking for batch native transaction', {
          entityId: batchEntityId,
          actionIndex: params.actionIndex,
        })
        return await this.findByEntityId(batchEntityId, tOpts)
      }

      const entityId = this.getEntityId(params as ITransactionIdParams)
      return await this.findByEntityId(entityId, tOpts)
    }
    // Otherwise fall back to searching by transaction hash and DAO
    return await this.findOne(
      {
        transactionHash: params.transactionHash,
        network: params.network,
        daoAddress: params.daoAddress,
      },
      null,
      tOpts,
    )
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findWithPagination({
    extraParams = {},
    paginationParams = {},
  }: {
    extraParams?: ITransactionExtraParams
    paginationParams?: IPaginationParams
  }): Promise<IPaginatedResult<ITransactionResponse>> {
    const request = ModelUtils.paginateAndSort(paginationParams)

    const ignoredParams = ['daoAddresses', 'onlyParent', 'tokenAddress']
    const dynamicFilter = Object.fromEntries(
      Object.entries(extraParams).filter(([key, value]) => value !== undefined && !ignoredParams.includes(key)),
    )
    const filter = {
      ...ModelUtils.createFilter(paginationParams, [
        'transactionHash',
        'fromAddress',
        'toAddress',
        'tokenAddress',
        'daoAddress',
        'side',
        'type',
      ]),
      ...dynamicFilter,
      ...(extraParams.tokenAddress && { 'token.address': extraParams.tokenAddress }),
    }

    if (extraParams?.daoAddresses?.length! > 0) {
      filter.daoAddress = { $in: extraParams.daoAddresses }
    }

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

  async update(params: Partial<Transaction>, tOpts?: SaveOptions) {
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

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(
      obj,
      '_id',
      'id',
      '__v',
      'isHidden',
      'createdAt',
      'updatedAt',
      'pluginAddress',
      'tokenAddress',
      'createdAt',
      'updatedAt',
    )
    filtered.token = filtered.token ? _.omit(filtered.token, '_id', '__v') : undefined

    if (this.token?.snapshot) {
      filtered.token.historicalPriceUsd = filtered.token.snapshot.priceUsd
      filtered.token.snapshot = undefined
    }

    return filtered
  }
}
