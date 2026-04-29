import { type HexAddress, type NetworksEnum } from './networks'
import {type FormattedString} from '@grammyjs/parse-mode'
import { InlineKeyboard } from 'grammy'

export enum ITelegramNotificationEvent {
  ProposalCreated = 'proposal.created',
  VoteCast = 'vote.cast',
  VoteReset = 'vote.reset',
}

export const TELEGRAM_DEFAULT_EVENTS: ITelegramNotificationEvent[] = [
  ITelegramNotificationEvent.ProposalCreated,
  ITelegramNotificationEvent.VoteCast,
  ITelegramNotificationEvent.VoteReset,
]

export enum ITelegramSubscriptionStatus {
  Active = 'active',
  Paused = 'paused',
  Blocked = 'blocked',
}

export interface ITelegramSubscriptionIdParams {
  telegramUserId: number
}

export interface ITelegramDaoSubscriptionParams {
  network: NetworksEnum
  daoAddress: HexAddress
}

export interface ITelegramDaoSubscriptionInput extends ITelegramDaoSubscriptionParams {
  events?: ITelegramNotificationEvent[]
}

export interface IRenderedNotification {
  text: string
  entities: FormattedString['entities']
  keyboard: InlineKeyboard
}

export const TELEGRAM_MAX_DAO_SUBSCRIPTIONS = 50
