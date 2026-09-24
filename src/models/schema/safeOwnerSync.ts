/**
 * One row per Safe whose owners we store: the block the stored owner set was last read at.
 * `syncOwners` takes this row inside its transaction, so concurrent writers queue on it and a
 * snapshot older than the recorded block is refused instead of overwriting newer data.
 */

import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.SafeOwnerSync

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
@index({ network: 1, safeAddress: 1 }, { unique: true })
export default class SafeOwnerSync extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public safeAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  static getEntityId(network: NetworksEnum, safeAddress: HexAddress): string {
    return `${network}-${safeAddress}`
  }
}
