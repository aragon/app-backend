import { assert } from '@errors'
import MemberPagination from '@models/utils/memberPagination'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type ISafeMemberIdParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.SafeMember

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
// Every Safe-side query carries the network, so the unique index below serves them. Member-side
// lookups run without a network and need their own.
@index({ memberAddress: 1 })
@index({ network: 1, safeAddress: 1, memberAddress: 1 }, { unique: true })
export default class SafeMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public safeAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  static async create(rawData: Partial<SafeMember> = {} as Partial<SafeMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.safeAddress, 'safeAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        safeAddress: rawData.safeAddress!,
        memberAddress: rawData.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ISafeMemberIdParams) {
    return `${params.network}-${params.safeAddress}-${params.memberAddress}`
  }

  /** Safe rows are global, so a DAO filter never applies here. */
  static async findAndPaginate({
    paginationParams = {},
    extraParams = {},
  }: {
    paginationParams?: IPaginationParams
    extraParams?: IMemberExtraParams
  }): Promise<IPaginatedResult<IMembersResponse>> {
    const filter = {
      ...(extraParams?.pluginAddress ? { safeAddress: extraParams.pluginAddress } : {}),
      ...(extraParams.network ? { network: extraParams.network } : {}),
    }
    return MemberPagination.findAndPaginate(this, filter, 'safeAddress', paginationParams)
  }
}
