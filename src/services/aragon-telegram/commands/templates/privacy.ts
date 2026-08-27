import config from '@config'
import { b, type FormattedString, fmt, link } from '@grammyjs/parse-mode'
import { TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS } from '@types'

const telegramPolicyLink = link('https://telegram.org/privacy')
const fullPolicyLink = link(config.SERVICES.ARAGON_TELEGRAM.PRIVACY_URL)
const fullPolicyLabel = config.SERVICES.ARAGON_TELEGRAM.PRIVACY_URL.replace(/^https?:\/\/(www\.)?/, '')

/** Body of the `/privacy` reply. Lists what we store, the user's data commands, and the policy URL. */
export const PRIVACY_BODY: FormattedString = fmt`${b}Privacy${b}

We store:
• Your Telegram user ID and chat ID
• The organizations you subscribe to
• Your notification preferences for each organization
• The version of this subscription notice you acknowledged, and when
• Pseudonymous delivery markers, kept for up to ${TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS} days to prevent duplicate notifications

We use this data only to send the notifications you requested. We don't use it for marketing, profiling, or automated decisions.

Telegram delivers messages on its own infrastructure (outside the EU); ${telegramPolicyLink}Telegram's privacy policy${telegramPolicyLink} applies to message delivery.

${b}Your data${b}
/mydata - View the data stored by this bot
/unsubscribe - Stop notifications for one organization
/forget - Delete the data stored by this bot

Full policy: ${fullPolicyLink}${fullPolicyLabel}${fullPolicyLink}`

/** Confirmation prompt before `/forget` actually deletes the user record. */
export const forgetConfirm = (subscriptionCount: number, deliveryMarkerCount: number): FormattedString =>
  fmt`${b}Delete your data?${b}

This deletes your Telegram user ID, your subscriptions (${subscriptionCount}), and recent delivery markers (${deliveryMarkerCount}) stored by this bot. You won't receive further notifications.`
