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

/** Days a Blocked record is kept before the TTL index deletes it. Index option, so not runtime config. */
export const TELEGRAM_BLOCKED_RETENTION_DAYS = 30

/**
 * Version of the subscription disclosure the user agreed to. Stored on every
 * record so we can show which wording was accepted and when. Bump this whenever
 * the `/start`, subscribe or `/privacy` disclosure text changes — the next
 * `/start` or `/subscribe` re-records consent against the new version.
 */
export const TELEGRAM_CONSENT_VERSION = '2026-08-24'
