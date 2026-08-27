import { InlineKeyboard } from 'grammy'
import { type HexAddress, type NetworksEnum } from './networks'

export enum ITelegramNotificationEvent {
  ProposalCreated = 'proposal.created',
  ProposalEnding = 'proposal.ending-soon',
  ProposalExecuted = 'proposal.executed',
}

export const TELEGRAM_DEFAULT_EVENTS: ITelegramNotificationEvent[] = [
  ITelegramNotificationEvent.ProposalCreated,
  ITelegramNotificationEvent.ProposalEnding,
  ITelegramNotificationEvent.ProposalExecuted,
]

export enum ITelegramSubscriptionStatus {
  Active = 'active',
  Paused = 'paused',
  Blocked = 'blocked',
}

export const TelegramNotificationOutboxStatus = {
  Pending: 'pending',
  Published: 'published',
} as const

export type TelegramNotificationOutboxStatus =
  (typeof TelegramNotificationOutboxStatus)[keyof typeof TelegramNotificationOutboxStatus]

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

/** Days delivery and dispatch deduplication markers are retained. */
export const TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS = 30

/** Days successfully-published outbox records are retained for audit and deduplication. */
export const TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS = 30

/**
 * Version of the subscription disclosure the user explicitly accepted. Stored
 * with an acceptance timestamp only after the user takes the acceptance action.
 * Bump this whenever the disclosure text changes.
 */
export const TELEGRAM_CONSENT_VERSION = '2026-08-27'
