/**
 * Privacy disclosure shown in the consent prompts. Shown once — at consent —
 * and expanded in /privacy; subscription confirmations don't repeat it.
 * Keep in sync with the /privacy reply body.
 */
export const SUBSCRIPTION_DISCLOSURE =
  'We store your Telegram user ID and your subscriptions to send these notifications. ' +
  "We don't use this data for marketing or profiling. Use /privacy to review how your " +
  'data is handled or /forget to delete the data stored by this bot.'
