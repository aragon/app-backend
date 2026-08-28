/** Sent when the removed subscription was the last one, which takes the whole bot record with it. */
export const LAST_SUBSCRIPTION_REMOVED =
  'That was your last subscription, so the data stored by this bot was deleted. Send /start to set up notifications again.'

/** Privacy notice shown before a user confirms a requested subscription. Keep in sync with `/privacy`. */
export const SUBSCRIPTION_DISCLOSURE =
  'We will store your Telegram recipient ID and this organization’s event preferences only to send the notifications ' +
  'you requested. Review /privacy, view /mydata, stop this subscription with /unsubscribe, or delete your data with /forget.'
