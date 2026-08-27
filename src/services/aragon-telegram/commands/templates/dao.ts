import { b, type FormattedString, fmt } from '@grammyjs/parse-mode'

export const DAO_LIST_HEADER = fmt`${b}Your notifications${b}

Select an organization to manage its notifications.`

export const NO_DAOS_TEXT = fmt`${b}Your notifications${b}

You aren't subscribed to any organizations yet.
Subscribe to an organization to start receiving notifications.`

/** Detail view for one organization — `paused` = per-organization pause (no events enabled). */
export const daoDetail = (daoName: string, paused: boolean): FormattedString =>
  fmt`${b}${daoName}${b}

${paused ? 'Notifications are paused.' : 'Notifications are on.'}`
