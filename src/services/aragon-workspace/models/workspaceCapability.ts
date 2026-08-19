import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, NetworksEnum } from '@types'
import { IWorkspaceAccountType } from '@workspace/types/workspace'
import { Model, type SaveOptions } from 'mongoose'

const customName = 'workspaceCapability'

/**
 * One row per (account, target, selector): "this account can call this function
 * on this contract". The deliverable of a workspace scan.
 */
@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: { customName },
})
@index({ workspaceId: 1, accountType: 1 })
@index({ workspaceId: 1, target: 1 })
@index({ workspaceId: 1, account: 1 })
export default class WorkspaceCapability extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public workspaceId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public target!: HexAddress

  @prop({ type: () => String, required: true })
  public account!: HexAddress

  @prop({ type: () => String, enum: IWorkspaceAccountType, required: true })
  public accountType!: IWorkspaceAccountType

  /** DAO name or plugin interface type, when the account resolved to something named. */
  @prop({ type: () => String, default: null })
  public accountRef!: string | null

  @prop({ type: () => String, required: true })
  public selector!: string

  @prop({ type: () => String, default: null })
  public functionName!: string | null

  /** null when the capability comes from ownership rather than a role. */
  @prop({ type: () => String, default: null })
  public viaRole!: string | null

  @prop({ type: () => String, default: null })
  public roleName!: string | null

  /** True when the gate behind this row was deduced rather than read from a revert. */
  @prop({ type: () => Boolean, default: false })
  public inferred!: boolean

  static async create(rawData: Partial<WorkspaceCapability> = {} as Partial<WorkspaceCapability>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      rawData.id = WorkspaceCapability.getEntityId(
        rawData.workspaceId!,
        rawData.target!,
        rawData.account!,
        rawData.selector!,
      )
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(workspaceId: string, target: HexAddress, account: HexAddress, selector: string) {
    return `${workspaceId}-${target}-${account}-${selector}`
  }
}
