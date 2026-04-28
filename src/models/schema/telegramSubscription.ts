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
export default class TelegramSubscription extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => Number, required: true, unique: true })
  public telegramUserId!: number

  @prop({ type: () => Number, required: true })
  public chatId!: number

  @prop({ type: () => String, default: null })
  public username?: string | null

  @prop({ type: () => String, default: null })
  public languageCode?: string | null

  @prop({
    type: () => String,
    enum: ITelegramSubscriptionStatus,
    default: ITelegramSubscriptionStatus.Active,
  })
  public status!: ITelegramSubscriptionStatus

  @prop({ type: () => [DaoSubscription], _id: false, default: [] })
  public subscriptions!: DaoSubscription[]

  @prop({ type: () => Number, default: null })
  public lastInteractionAt?: number | null

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

  static async findExistingLog(params: ITelegramSubscriptionIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return this.findOne({ id: entityId }, null, tOpts)
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

  async removeDaoSubscription(params: ITelegramDaoSubscriptionParams, tOpts?: SaveOptions) {
    const daoId = TelegramSubscription.getDaoId(params)
    const before = this.subscriptions.length
    this.subscriptions = this.subscriptions.filter(sub => sub.daoId !== daoId) as any
    if (this.subscriptions.length === before) return this
    return await this.save(tOpts)
  }

  async setEvents(params: ITelegramDaoSubscriptionParams, events: ITelegramNotificationEvent[], tOpts?: SaveOptions) {
    const daoId = TelegramSubscription.getDaoId(params)
    const existing = this.subscriptions.find(sub => sub.daoId === daoId)
    assert(!!existing, 'Subscription not found')
    existing!.events = events
    return await this.save(tOpts)
  }

  async setStatus(status: ITelegramSubscriptionStatus, tOpts?: SaveOptions) {
    if (this.status === status) return this
    this.status = status
    return await this.save(tOpts)
  }

  async touchInteraction(tOpts?: SaveOptions) {
    this.lastInteractionAt = Date.now()
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
