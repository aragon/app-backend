import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogDao, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = 'LogDao'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logDao',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  blockNumber: 1,
  transactionHash: 1,
})
export default class LogDao extends Model {
  @prop({ type: () => String, enum: IEventLogDao, required: true })
  public event!: IEventLogDao

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String })
  public address!: HexAddress

  /**
   * Token Deposits
   */
  @prop({ type: () => String })
  public nativeTokenDepositAmount!: string

  @prop({ type: () => String })
  public nativeTokenDepositorAddress!: string

  @prop({ type: () => String })
  public tokenDepositAmount!: string

  @prop({ type: () => String })
  public tokenAddress!: string

  @prop({ type: () => String })
  public tokenDepositorAddress!: string

  /**
   * Dao Proposal Executed
   */

  @prop({ type: () => String })
  public actorAddress!: string

  @prop({ type: () => Array })
  public actions!: Array<{
    to: string
    value: string
    data: string
  }>

  static async create(rawData: Partial<LogDao>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }
}
