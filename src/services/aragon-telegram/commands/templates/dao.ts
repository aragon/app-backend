import { b, code, type FormattedString, fmt } from '@grammyjs/parse-mode'

export const daoListHeader = (page: number, pageCount: number): FormattedString =>
  fmt`${b}Your notifications${b}

Select an organization to manage its notifications.${pageCount > 1 ? `\nPage ${page + 1} of ${pageCount}.` : ''}`

export const NO_DAOS_TEXT = fmt`${b}Your notifications${b}

You aren't subscribed to any organizations yet.
Subscribe to an organization to start receiving notifications.`

/**
 * Detail view for one organization — `paused` = per-organization pause (no events
 * enabled), `accountPaused` = the account-wide /pause that silences everything.
 * The id line lets the user tell same-named organizations apart.
 */
export const daoDetail = (daoName: string, daoId: string, paused: boolean, accountPaused = false): FormattedString =>
  fmt`${b}${daoName}${b}

${code}${daoId}${code}

${paused ? 'Notifications are paused.' : 'Notifications are on.'}${
  accountPaused ? '\nAll notifications are paused for your account. Use /resume to turn them back on.' : ''
}`
