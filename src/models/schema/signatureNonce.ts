import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const customName = ICollectionNames.SignatureNonce

const NONCE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

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
@index({ nonce: 1 }, { unique: true })
@index({ daoAddress: 1, network: 1 })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export default class SignatureNonce extends Model {
  @prop({ type: () => String, required: true })
  public nonce!: string

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public action!: string

  @prop({ type: () => Number, required: true })
  public expiresAt!: number

  @prop({ type: () => Number, default: null })
  public usedAt?: number

  static async generate(params: {
    daoAddress: HexAddress
    network: NetworksEnum
    action: string
  }): Promise<SignatureNonce> {
    const { daoAddress, network, action } = params
    const nonce = uuidv4()
    const expiresAt = Date.now() + NONCE_EXPIRY_MS

    const doc = new this({
      nonce,
      daoAddress,
      network,
      action,
      expiresAt,
    })

    return await doc.save()
  }

  static async findByNonce(nonce: string, tOpts?: SaveOptions) {
    return await this.findOne({ nonce }, null, tOpts)
  }

  static async consumeNonce(nonce: string): Promise<SignatureNonce | null> {
    const now = Date.now()

    // Atomic operation to prevent race conditions
    const updatedDoc = await this.findOneAndUpdate(
      {
        nonce,
        usedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: { usedAt: now },
      },
      {
        new: true,
      },
    )

    return updatedDoc
  }

  static async findValidNonce(nonce: string): Promise<SignatureNonce | null> {
    const now = Date.now()
    return await this.findOne({
      nonce,
      usedAt: null,
      expiresAt: { $gt: now },
    })
  }

  get isExpired(): boolean {
    return Date.now() > this.expiresAt
  }

  get isUsed(): boolean {
    return !!this.usedAt
  }
}
