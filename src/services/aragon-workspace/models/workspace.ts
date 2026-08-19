import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, NetworksEnum } from '@types'
import { IWorkspaceStatus } from '@workspace/types/workspace'
import { Model, type SaveOptions } from 'mongoose'

const customName = 'workspace'

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
@index({ status: 1 })
@index({ creator: 1, createdAt: -1 })
export default class Workspace extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  /** Unique across every creator, so the name alone identifies a workspace. */
  @prop({ type: () => String, required: true, unique: true })
  public name!: string

  /** Whoever asked for the scan. Not authenticated — this is a POC. */
  @prop({ type: () => String, required: true })
  public creator!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  /** Checksummed, deduplicated at creation. */
  @prop({ type: () => [String], required: true })
  public targets!: HexAddress[]

  @prop({ type: () => String, enum: IWorkspaceStatus, default: IWorkspaceStatus.pending })
  public status!: IWorkspaceStatus

  /** Set when the scan itself failed, as opposed to individual targets failing. */
  @prop({ type: () => String, default: null })
  public error!: string | null

  static async create(rawData: Partial<Workspace> = {} as Partial<Workspace>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }
}
