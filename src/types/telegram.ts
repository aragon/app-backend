import { type HexAddress, type NetworksEnum } from './networks'
import { InlineKeyboard } from 'grammy'

export enum ITelegramNotificationEvent {
  ProposalCreated = 'proposal.created',
  ProposalEnding = 'proposal.ending-soon',
  VoteCast = 'vote.cast',
  VoteReset = 'vote.reset',
}

export const TELEGRAM_DEFAULT_EVENTS: ITelegramNotificationEvent[] = [
  ITelegramNotificationEvent.ProposalCreated,
  ITelegramNotificationEvent.ProposalEnding,
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
  /** Pre-built HTML body to send with `parse_mode: 'HTML'`. */
  text: string
  keyboard: InlineKeyboard
}

export const TELEGRAM_MAX_DAO_SUBSCRIPTIONS = 50
