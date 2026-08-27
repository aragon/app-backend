import { b, type FormattedString, fmt } from '@grammyjs/parse-mode'
import { SUBSCRIBE_HELP } from '@services/aragon-telegram/commands/templates/onboarding'

/** `/subscribe` with no argument — same instruction as the menu button. */
export const SUBSCRIBE_USAGE = SUBSCRIBE_HELP

export const UNSUBSCRIBE_USAGE = fmt`${b}Unsubscribe from an organization${b}

Send /unsubscribe with the organization's ENS name, its Aragon URL, or its network and address.`

/** Reply sent on a successful `/subscribe` — identical wording to the deep-link confirmation. */
export const subscribedReply = (daoName: string): FormattedString =>
  fmt`Notifications are on for ${b}${daoName}${b}.

Use /dao to manage your notifications.`

/** Reply when the user already subscribes to the organization — nothing is changed. */
export const alreadySubscribedReply = (daoName: string): FormattedString =>
  fmt`Notifications are already on for ${b}${daoName}${b}.
Use /dao to manage them.`

export const searchResultsHeader = (query: string, truncated: boolean): string =>
  `Organizations matching “${query}”. Select one to subscribe:${
    truncated ? '\nShowing the first 5. Refine the search to see more.' : ''
  }`

export const searchNoMatches = (query: string): string =>
  `No organizations found for “${query}”. Check the spelling, or use the organization's Aragon URL.`
