/**
 * A Safe's queued and executed transactions, so they can be listed without an upstream call. Never
 * the authority: `refreshedAt` says how old the copy is, and anything about to be signed is re-read
 * from the Safe service. Keyed by `safeTxHash`, not nonce: two rival transactions can hold the same
 * nonce while pending.
 */

import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import { type HexAddress, ICollectionNames, ISafeTransactionState, NetworksEnum } from '@types'
import { Model, Schema } from 'mongoose'

const customName = ICollectionNames.SafeTransaction

class SafeRawAction {
  @prop({ type: () => String, default: null })
  public to!: string

  @prop({ type: () => String, default: null })
  public value!: string

  @prop({ type: () => String, default: null })
  public data!: string
}

class SafeTransactionConfirmation {
  @prop({ type: () => String, required: true })
  public owner!: HexAddress

  @prop({ type: () => String, default: null })
  public signature!: string | null

  @prop({ type: () => String, default: null })
  public signatureType!: string | null

  @prop({ type: () => String, default: null })
  public submissionDate!: string | null
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
    allowMixed: Severity.ALLOW,
  },
})
@index({ network: 1, safeAddress: 1, safeTxHash: 1 }, { unique: true })
@index({ network: 1, safeAddress: 1, state: 1 })
export default class SafeTransaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public safeAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public safeTxHash!: string

  /** uint256 as a decimal string. Compared with BigInt, never sorted as text. */
  @prop({ type: () => String, required: true })
  public nonce!: string

  @prop({ type: () => String, required: true, enum: ISafeTransactionState, default: ISafeTransactionState.live })
  public state!: ISafeTransactionState

  @prop({ type: () => String, required: true })
  public to!: HexAddress

  /**
   * The calls the transaction makes: one for a plain call, one per inner call when `to` is a
   * MultiSend. Split only; `DecodeActions` decodes them off the refresh path.
   */
  @prop({ type: () => [SafeRawAction], _id: false, default: [] })
  public rawActions!: SafeRawAction[]

  /** The addresses those actions call. A batch's own `to` is the MultiSend contract. */
  @prop({ type: () => [String], default: [] })
  public targets!: HexAddress[]

  /** The raw actions decoded, in the shape a proposal's `actions` carries. Decoded once: `safeTxHash` commits to the calldata. */
  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public actions!: any[]

  /** A decode is still owed on this row. Set on insert, cleared when the decode lands. */
  @prop({ type: () => Boolean, default: false })
  public decoding!: boolean

  @prop({ type: () => String, default: null })
  public value!: string | null

  @prop({ type: () => String, default: null })
  public data!: string | null

  @prop({ type: () => Number, default: 0 })
  public operation!: number

  @prop({ type: () => String, default: null })
  public safeTxGas!: string | null

  @prop({ type: () => String, default: null })
  public baseGas!: string | null

  @prop({ type: () => String, default: null })
  public gasPrice!: string | null

  @prop({ type: () => String, default: null })
  public gasToken!: HexAddress | null

  @prop({ type: () => String, default: null })
  public refundReceiver!: HexAddress | null

  /** The proposing owner. Upstream calls it `proposer`; the wire contract renames it once, to this. */
  @prop({ type: () => String, default: null })
  public from!: HexAddress | null

  @prop({ type: () => [SafeTransactionConfirmation], _id: false, default: [] })
  public confirmations!: SafeTransactionConfirmation[]

  @prop({ type: () => Number, default: 0 })
  public confirmationsRequired!: number

  @prop({ type: () => String, default: null })
  public submissionDate!: string | null

  /** Executed transactions only. */
  @prop({ type: () => String, default: null })
  public executionDate!: string | null

  /** Executed transactions only: the onchain transaction that executed it. */
  @prop({ type: () => String, default: null })
  public transactionHash!: string | null

  @prop({ type: () => Number, default: null })
  public executionBlockNumber!: number | null

  @prop({ type: () => Boolean, default: null })
  public isSuccessful!: boolean | null

  /** When this copy was last taken from the Safe service. */
  @prop({ type: () => Date, required: true })
  public refreshedAt!: Date

  static buildId(network: NetworksEnum, safeAddress: string, safeTxHash: string): string {
    return `${network}-${safeAddress}-${safeTxHash}`
  }
}
