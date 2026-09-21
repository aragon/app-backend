/**
 * Queued Safe transactions, kept so a Safe's pending work can be listed without an upstream call.
 *
 * A pending Safe transaction exists offchain only, so nothing indexes it and every viewer used to
 * pay the shared Safe API for it. A row gives one an Aragon identity that can be listed, linked and
 * searched, and it survives the Safe service being unreachable.
 *
 * It is never the authority. `refreshedAt` says how old the copy is, and anything about to be signed
 * is re-read from the Safe service first: a stale list is harmless, a stale `safeTxHash` is not.
 *
 * Keyed by `safeTxHash`, not by nonce. Two rival transactions can hold the same nonce while both are
 * pending, so a nonce is not unique until one of them executes.
 */

import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, ICollectionNames, ISafeTransactionState, NetworksEnum } from '@types'
import { Model } from 'mongoose'

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
  },
})
@index({ network: 1, safeAddress: 1, safeTxHash: 1 }, { unique: true })
@index({ network: 1, safeAddress: 1, state: 1 })
@index({ network: 1, targets: 1, state: 1, submissionDate: -1 })
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
   * What the transaction actually calls, in the same shape a DAO `Executed` event hands over: one
   * action for a plain call, one per inner call when `to` is a MultiSend.
   *
   * Only the split happens here. Decoding them into readable actions is the existing
   * `DecodeActions` path, which costs ABI lookups and must not run on a queue refresh.
   */
  @prop({ type: () => [SafeRawAction], _id: false, default: [] })
  public rawActions!: SafeRawAction[]

  /**
   * The addresses those actions call.
   *
   * A batched transaction's `to` is the MultiSend contract, so asking "does this concern that DAO"
   * of `to` alone answers no for every batch the app composes. This is what that question reads.
   */
  @prop({ type: () => [String], default: [] })
  public targets!: HexAddress[]

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

  @prop({ type: () => Boolean, default: null })
  public isSuccessful!: boolean | null

  /** When this copy was last taken from the Safe service. */
  @prop({ type: () => Date, required: true })
  public refreshedAt!: Date

  static buildId(network: NetworksEnum, safeAddress: string, safeTxHash: string): string {
    return `${network}-${safeAddress}-${safeTxHash}`
  }
}
