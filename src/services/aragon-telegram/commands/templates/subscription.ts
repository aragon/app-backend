import { b, code, fmt, type FormattedString } from '@grammyjs/parse-mode'
import { SUBSCRIPTION_DISCLOSURE } from '@services/aragon-telegram/commands/templates/shared'

export const SUBSCRIBE_USAGE = fmt`${b}Usage:${b} ${code}/subscribe <dao>${code}

Any of these formats works:
• full URL — ${code}https://app.aragon.org/dao/ethereum-sepolia/0xDd1...${code}
• network and address — ${code}/subscribe ethereum-mainnet 0xabcd...${code}
• combined — ${code}/subscribe ethereum-mainnet-0xabcd...${code}
• camelCase — ${code}/subscribe ethereumMainnet-0xabcd...${code}`

export const UNSUBSCRIBE_USAGE = fmt`${b}Usage:${b} ${code}/unsubscribe <dao>${code}

Same formats as ${code}/subscribe${code} (URL, network + address, hyphenated, or camelCase).`

/** Reply sent on a successful `/subscribe`. */
export const subscribedReply = (daoName: string): FormattedString =>
  fmt`🔔 Subscribed to ${b}${daoName}${b}. Use /dao to manage your subscriptions.

${SUBSCRIPTION_DISCLOSURE}`
