/** Sent when the removed subscription was the last one, which takes the whole bot record with it. */
export const lastSubscriptionRemoved = (daoName: string): string =>
  `You're no longer subscribed to ${daoName}.\n\n` +
  "You aren't subscribed to any organization, so the data stored by this bot has been deleted. " +
  'Residual operational backups and logs are handled under the published retention policy. ' +
  'Subscribing again will show the privacy notice first.'

/** Privacy notice shown before a user confirms a requested subscription. Keep in sync with `/privacy`. */
export const SUBSCRIPTION_DISCLOSURE =
  'We will store your Telegram recipient ID and this organization’s event preferences only to send the notifications ' +
  'you requested. Review /privacy, view /mydata, stop this subscription with /unsubscribe, or delete your data with /forget.'
