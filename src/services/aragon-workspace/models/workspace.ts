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

  /**
   * Free-text heading for display. `name` stays the identifier — it is unique
   * and gets looked up, so it cannot double as something the creator retitles.
   */
  @prop({ type: () => String, default: null })
  public title!: string | null

  @prop({ type: () => String, default: null })
  public description!: string | null

  /** Logo URL. Stored as given; nothing fetches it. */
  @prop({ type: () => String, default: null })
  public logo!: string | null

  /** Whoever asked for the scan. Not authenticated — this is a POC. */
  @prop({ type: () => String, required: true })
  public creator!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  /** Checksummed, deduplicated at creation. */
  @prop({ type: () => [String], required: true })
  public targets!: HexAddress[]

  /**
   * Accounts the creator asked about, checksummed and deduplicated. Verified
   * against the gates by direct reads during the scan. Empty means the
   * workspace relies on discovery alone.
   */
  @prop({ type: () => [String], default: [] })
  public accounts!: HexAddress[]

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
