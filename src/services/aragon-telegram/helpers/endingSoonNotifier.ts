import config from '@config'
import { Models } from '@dbModels'
import TelegramNotifier from '@helpers/telegramNotifier'
import logger from '@logger'
import { ITelegramNotificationEvent } from '@types'

const llo = logger.logMeta.bind(null, { service: 'telegram:endingSoon' })

/**
 * Scheduled reminder for proposals whose voting window closes soon.
 *
 * Runs under the TaskScheduler (distributed lock, one instance at a time).
 * Each run scans proposals of subscribed DAOs whose `endDate` falls inside
 * the reminder window, claims a per-proposal marker in
 * `TelegramNotifiedEvent`, and publishes a `proposal.ending-soon` event to
 * the notification queue. The claim makes the reminder at-most-once across
 * runs and restarts.
 */
export const EndingSoonNotifier = {
  start: async (): Promise<void> => {
    const windowHours = config.SERVICES.ARAGON_TELEGRAM.ENDING_SOON_WINDOW_HOURS
    const now = Math.floor(Date.now() / 1000)
    const windowEnd = now + windowHours * 60 * 60

    const daos = await Models.TelegramSubscription.findDaosWithActiveSubscribers(
      ITelegramNotificationEvent.ProposalEnding,
    )

    for (const dao of daos) {
      const proposals = await Models.Proposal.find(
        {
          network: dao.network,
          daoAddress: dao.daoAddress,
          endDate: { $gt: now, $lte: windowEnd },
          'executed.status': { $ne: true },
        },
        { _id: 0, id: 1 },
      )

      for (const proposal of proposals) {
        const key = `proposal-ending:${proposal.id}`
        const claimed = await Models.TelegramNotifiedEvent.claim(key)
        if (!claimed) continue

        await TelegramNotifier.publish({
          id: key,
          event: ITelegramNotificationEvent.ProposalEnding,
          network: dao.network,
          daoAddress: dao.daoAddress,
          proposalId: proposal.id,
        })
        logger.verbose('endingSoon: reminder published', llo({ key, network: dao.network, daoAddress: dao.daoAddress }))
      }
    }
  },
}
