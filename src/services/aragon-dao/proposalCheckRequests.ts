import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import ProposalCheckQueue from '@modules/proposalChecks/queue'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:requests' })

/**
 * Moves durable assessment requests onto the queue. A request is stamped published only after
 * the broker confirmed it, so a crash in between republishes the same id and the consumer's own
 * lease makes the repeat harmless. Failures stay pending for the next run. A request whose
 * worker died mid-run is found by its expired lease and republished the same way.
 */
export const ProposalCheckRequestPublisher = {
  start: async (): Promise<void> => {
    const released = await Models.ProposalAssessment.releaseExpired()
    if (released)
      logger.warn('proposal checks: requests with an expired lease handed back for republishing', llo({ released }))
    const requests = await Models.ProposalAssessment.findUnpublished(config.PROPOSAL_CHECKS.PUBLISH_BATCH_SIZE)

    for (const request of requests) {
      try {
        await ProposalCheckQueue.publish(request.toQueuePayload())
        await request.markPublished()
        logger.verbose('proposal checks: request published', llo({ id: request.id, proposalId: request.proposalId }))
      } catch (error) {
        await request.markPublishFailed(error, config.PROPOSAL_CHECKS.PUBLISH_INTERVAL)
        logger.warn('proposal checks: request publish failed; will retry', llo({ id: request.id, error }))
      }
    }
  },
}
