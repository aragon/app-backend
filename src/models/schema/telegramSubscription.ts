import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type HexAddress,
  ICollectionNames,
  type ITelegramDaoSubscriptionInput,
  type ITelegramDaoSubscriptionParams,
  ITelegramNotificationEvent,
  type ITelegramSubscriptionIdParams,
  ITelegramSubscriptionStatus,
  NetworksEnum,
  TELEGRAM_BLOCKED_RETENTION_DAYS,
  TELEGRAM_CONSENT_VERSION,
  TELEGRAM_DEFAULT_EVENTS,
  TELEGRAM_MAX_DAO_SUBSCRIPTIONS,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.TelegramSubscription

class DaoSubscription {
  @prop({ type: () => String, required: true })
  public daoId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({
    type: () => [String],
    enum: ITelegramNotificationEvent,
    default: TELEGRAM_DEFAULT_EVENTS,
  })
  public events!: ITelegramNotificationEvent[]

  @prop({ type: () => Number, required: true })
  public subscribedAt!: number
}

/** Which disclosure wording the user accepted, and when. */
class TelegramConsent {
  @prop({ type: () => String, required: true })
  public version!: string

  @prop({ type: () => Number, required: true })
  public acceptedAt!: number
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
@index({ telegramUserId: 1 }, { unique: true })
@index({ 'subscriptions.daoId': 1, status: 1 })
// TTL only applies to documents where `blockedAt` holds a date; active records never carry one.
@index({ blockedAt: 1 }, { expireAfterSeconds: TELEGRAM_BLOCKED_RETENTION_DAYS * 24 * 60 * 60 })
export default class TelegramSubscription extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => Number, required: true, unique: true })
  public telegramUserId!: number

  @prop({ type: () => Number, required: true })
  public chatId!: number

  @prop({
    type: () => String,
    enum: ITelegramSubscriptionStatus,
    default: ITelegramSubscriptionStatus.Active,
  })
  public status!: ITelegramSubscriptionStatus

  @prop({ type: () => [DaoSubscription], _id: false, default: [] })
  public subscriptions!: DaoSubscription[]

  @prop({ type: () => Date })
  public blockedAt?: Date

  @prop({
    type: () => TelegramConsent,
    _id: false,
    default: () => ({ version: TELEGRAM_CONSENT_VERSION, acceptedAt: Date.now() }),
  })
  public consent!: TelegramConsent

  static getEntityId(params: ITelegramSubscriptionIdParams) {
    return `tg-${params.telegramUserId}`
  }

  static getDaoId(params: ITelegramDaoSubscriptionParams) {
    return `${params.network}-${params.daoAddress}`
  }

  static async create(
    rawData: Partial<TelegramSubscription> = {} as Partial<TelegramSubscription>,
    tOpts?: SaveOptions,
  ) {
    if (!rawData.id) {
      assert(rawData.telegramUserId !== undefined && rawData.telegramUserId !== null, 'telegramUserId is required')
      rawData.id = this.getEntityId({ telegramUserId: rawData.telegramUserId! })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findByTelegramUserId(telegramUserId: number, tOpts?: SaveOptions) {
    return this.findOne({ telegramUserId }, null, tOpts)
  }

  static async findActiveSubscribersForDao(params: ITelegramDaoSubscriptionParams, event: ITelegramNotificationEvent) {
    const daoId = this.getDaoId(params)
    return this.find(
      {
        status: ITelegramSubscriptionStatus.Active,
        subscriptions: {
          $elemMatch: {
            daoId,
            events: event,
          },
        },
      },
      { _id: 0, telegramUserId: 1, chatId: 1 },
    )
  }

  /** Distinct DAOs having at least one active subscriber for `event`. */
  static async findDaosWithActiveSubscribers(
    event: ITelegramNotificationEvent,
  ): Promise<{ network: NetworksEnum; daoAddress: HexAddress }[]> {
    return this.aggregate([
      { $match: { status: ITelegramSubscriptionStatus.Active, 'subscriptions.events': event } },
      { $unwind: '$subscriptions' },
      { $match: { 'subscriptions.events': event } },
      {
        $group: {
          _id: '$subscriptions.daoId',
          network: { $first: '$subscriptions.network' },
          daoAddress: { $first: '$subscriptions.daoAddress' },
        },
      },
      { $project: { _id: 0, network: 1, daoAddress: 1 } },
    ])
  }

  hasDaoSubscription(params: ITelegramDaoSubscriptionParams): boolean {
    const daoId = TelegramSubscription.getDaoId(params)
    return this.subscriptions.some(sub => sub.daoId === daoId)
  }

  async addDaoSubscription(input: ITelegramDaoSubscriptionInput, tOpts?: SaveOptions) {
    const daoId = TelegramSubscription.getDaoId(input)
    const existing = this.subscriptions.find(sub => sub.daoId === daoId)
    const events = input.events ?? TELEGRAM_DEFAULT_EVENTS

    if (existing) {
      existing.events = events
    } else {
      assert(
        this.subscriptions.length < TELEGRAM_MAX_DAO_SUBSCRIPTIONS,
        `Subscription limit reached (${TELEGRAM_MAX_DAO_SUBSCRIPTIONS})`,
      )
      this.subscriptions.push({
        daoId,
        network: input.network,
        daoAddress: input.daoAddress,
        events,
        subscribedAt: Date.now(),
      } as DaoSubscription)
    }

    return await this.save(tOpts)
  }

  /** Removing the last DAO deletes the whole record — no empty user docs are kept. */
  async removeDaoSubscription(params: ITelegramDaoSubscriptionParams, tOpts?: SaveOptions) {
    const daoId = TelegramSubscription.getDaoId(params)
    const before = this.subscriptions.length
    this.subscriptions = this.subscriptions.filter(sub => sub.daoId !== daoId) as any
    if (this.subscriptions.length === before) return this
    if (this.subscriptions.length === 0) {
      await this.deleteOne(tOpts as any)
      return this
    }
    return await this.save(tOpts)
  }

  async setEvents(params: ITelegramDaoSubscriptionParams, events: ITelegramNotificationEvent[], tOpts?: SaveOptions) {
    const daoId = TelegramSubscription.getDaoId(params)
    const existing = this.subscriptions.find(sub => sub.daoId === daoId)
    assert(!!existing, 'Subscription not found')
    existing!.events = events
    return await this.save(tOpts)
  }

  /** Records acceptance of `version`; a no-op while the user is already on it. */
  async recordConsent(version: string, tOpts?: SaveOptions) {
    if (this.consent?.version === version) return this
    this.consent = { version, acceptedAt: Date.now() } as TelegramConsent
    return await this.save(tOpts)
  }

  async setStatus(status: ITelegramSubscriptionStatus, tOpts?: SaveOptions) {
    if (this.status === status) return this
    this.status = status
    if (status === ITelegramSubscriptionStatus.Blocked) {
      this.blockedAt = new Date()
    } else if (this.blockedAt) {
      this.blockedAt = undefined
    }
    return await this.save(tOpts)
  }
}
