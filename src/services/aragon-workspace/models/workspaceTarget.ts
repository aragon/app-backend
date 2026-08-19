import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, NetworksEnum } from '@types'
import { IAccessControlScheme } from '@workspace/types/accessControl'
import { type IWorkspaceGate, IWorkspaceTargetStatus } from '@workspace/types/workspace'
import { Model, type SaveOptions } from 'mongoose'

const customName = 'workspaceTarget'

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
@index({ workspaceId: 1, address: 1 }, { unique: true })
@index({ workspaceId: 1, status: 1 })
export default class WorkspaceTarget extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public workspaceId!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: IWorkspaceTargetStatus, default: IWorkspaceTargetStatus.pending })
  public status!: IWorkspaceTargetStatus

  @prop({ type: () => [String], enum: IAccessControlScheme, default: [] })
  public schemes!: IAccessControlScheme[]

  @prop({ type: () => String, default: null })
  public owner!: HexAddress | null

  @prop({ type: () => String, default: null })
  public pendingOwner!: HexAddress | null

  @prop({ type: () => String, default: null })
  public authority!: HexAddress | null

  /** null when the contract does not answer ERC-165 at all — see IAccessControlReport. */
  @prop({ type: () => Boolean, default: null })
  public supportsAccessControlInterface!: boolean | null

  /**
   * Everything gated on this contract: per gate, what it demands, who satisfies
   * it, and which functions it protects.
   *
   * Open and unclassifiable functions are not here — there is no gate to
   * attribute to anyone — so an empty array means nothing gated was found rather
   * than nothing was scanned. `status` is what says whether the scan worked.
   */
  @prop({ type: () => [Object], default: [] })
  public gates!: IWorkspaceGate[]

  @prop({ type: () => String, default: null })
  public error!: string | null

  static async create(rawData: Partial<WorkspaceTarget> = {} as Partial<WorkspaceTarget>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      rawData.id = WorkspaceTarget.getEntityId(rawData.workspaceId!, rawData.address!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(workspaceId: string, address: HexAddress) {
    return `${workspaceId}-${address}`
  }
}
