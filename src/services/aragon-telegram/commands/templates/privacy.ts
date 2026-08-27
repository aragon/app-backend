import config from '@config'
import { b, type FormattedString, fmt } from '@grammyjs/parse-mode'

/** Body of the `/privacy` reply. Lists what we store, the user's rights, and the policy URL. */
export const PRIVACY_BODY: FormattedString = fmt`🔒 ${b}Privacy${b}

We store:
• Your Telegram user ID and chat ID
• DAO subscriptions you create
• Per-DAO event preferences (proposals, votes, resets)
• Which version of this notice you accepted, and when

This data is used only to deliver the notifications you requested.
No marketing, no profiling, no automated decisions.

Telegram delivers messages on its own infrastructure (outside the EU); their privacy policy applies to the transport layer.

${b}Your rights${b}
• /mydata — show all data we store on you
• /unsubscribe <dao> — stop notifications for a single DAO
• /forget — delete all your data

Full policy: ${config.SERVICES.ARAGON_TELEGRAM.PRIVACY_URL}`

/** Confirmation prompt before `/forget` actually deletes the user record. */
export const forgetConfirm = (subscriptionCount: number): FormattedString =>
  fmt`⚠️ ${b}Are you sure?${b}

This deletes all your subscriptions (${subscriptionCount}) and your bot record.
The live bot record is deleted immediately. Any residual operational backups or logs are handled under the published retention policy.
There is no undo.`
