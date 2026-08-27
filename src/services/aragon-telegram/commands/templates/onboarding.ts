import { b, code, type FormattedString, fmt } from '@grammyjs/parse-mode'
import { SUBSCRIPTION_DISCLOSURE } from '@services/aragon-telegram/commands/templates/shared'

export const consentSubscribePrompt = (daoName: string): FormattedString =>
  fmt`${b}Subscribe to ${daoName}?${b}

${SUBSCRIPTION_DISCLOSURE}

Select ${b}Agree${b} to accept and subscribe.`

export const CONSENT_CANCELLED = 'Cancelled. Send /start anytime.'

export const HELP_TEXT = fmt`${b}Help${b}

${b}Stay on top of governance.${b} Get notifications about proposal activity in the organizations you subscribe to:
• New proposals
• Proposal ending soon
• Proposal executions

${b}Commands${b}
/subscribe ${code}<network>-<address>${code} - Subscribe to an organization
/unsubscribe ${code}<network>-<address>${code} - Unsubscribe from an organization
/dao - Manage your notifications
/pause - Pause all notifications
/resume - Resume all notifications
/mydata - View the data stored by this bot
/forget - Delete the data stored by this bot
/privacy - View the privacy policy
/help - View this help message

You can also subscribe from the organization's page in the Aragon app, or by sending its Aragon URL.`

export const COLD_START = fmt`Subscribe to an organization to get notifications about its proposal activity.`

export const SUBSCRIBE_HELP = fmt`${b}Subscribe to an organization${b}

Open the organization in the Aragon app and select Subscribe on its page.

You can also send /subscribe with the organization's name or ENS name, its Aragon URL, or its network and address:

${code}/subscribe citrea${code}
${code}/subscribe polygoncommunitytreasury.dao.eth${code}
${code}/subscribe https://app.aragon.org/dao/ethereum-mainnet/0xabcd…${code}
${code}/subscribe ethereum-mainnet-0xabcd…${code}`

/** Reply sent right after a deep-link `/start` auto-subscribes the user. */
export const autoSubscribedReply = (daoName: string): FormattedString =>
  fmt`Notifications are on for ${b}${daoName}${b}.

Use /dao to manage your notifications.`
