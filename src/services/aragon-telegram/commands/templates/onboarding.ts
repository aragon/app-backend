import { b, code, fmt, type FormattedString } from '@grammyjs/parse-mode'
import { SUBSCRIPTION_DISCLOSURE } from '@services/aragon-telegram/commands/templates/shared'

export const HELP_TEXT = fmt`${b}Aragon Notifications Bot${b}

I send you Telegram alerts about activity on the DAOs you follow:
• new proposals
• votes cast
• vote resets

${b}Commands${b}
/subscribe ${code}<network>-<daoAddress>${code} — follow a DAO
/unsubscribe ${code}<network>-<daoAddress>${code} — stop following a DAO
/dao — list your DAOs and toggle notifications
/pause — temporarily stop all notifications
/resume — re-enable notifications
/mydata — show what data we store about you
/forget — delete all your data
/privacy — privacy & data policy
/help — show this message

To follow a DAO, open its page on app.aragon.org and tap ${b}'Open in Telegram'${b}.`

export const COLD_START = fmt`👋 ${b}Welcome!${b}

I send Telegram alerts when DAOs you follow have:
🗳 new proposals
✅ votes cast
↩️ vote resets

We store your Telegram ID and DAO subscriptions to deliver these alerts.
Use /privacy for details, /forget to delete your data.

Tap a button below to get started.`

export const SUBSCRIBE_HELP = fmt`${b}To follow a DAO, you have two options:${b}

${b}1)${b} Open the DAO on ${b}app.aragon.org${b} and tap ${b}Open in Telegram${b}.

${b}2)${b} Send me ${code}/subscribe${code} with the DAO. Any of these formats works:

• full URL
${code}/subscribe https://app.aragon.org/dao/ethereum-sepolia/0xDd1...${code}

• network and address
${code}/subscribe ethereum-mainnet 0xabcd...${code}

• combined
${code}/subscribe ethereum-mainnet-0xabcd...${code}

• camelCase
${code}/subscribe ethereumMainnet-0xabcd...${code}`

/** Reply sent right after a deep-link `/start` auto-subscribes the user. */
export const autoSubscribedReply = (daoName: string): FormattedString =>
  fmt`🔔 You're now following ${b}${daoName}${b}.

I'll DM you when there are new proposals, votes, or resets.

${SUBSCRIPTION_DISCLOSURE}`
