import config from '@config'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName, type IQueueProposalCheck } from '@types'

/**
 * The queue side of proposal checks. Publishing goes through the confirm channel so a refused
 * send is an error the publisher sees. Retries and dead-lettering are the queue envelope's job;
 * this module only states the policy.
 */
const ProposalCheckQueue = {
  async publish(payload: IQueueProposalCheck): Promise<void> {
    const channelWrapper = RabbitMQ.getChannel(EnumQueueName.proposalChecks)
    await channelWrapper.sendToQueue(EnumQueueName.proposalChecks, payload, {
      persistent: true,
      contentType: 'application/json',
    })
  },

  retryOptions() {
    return {
      retry: {
        maxAttempts: config.PROPOSAL_CHECKS.MAX_ATTEMPTS,
        baseDelayMs: config.PROPOSAL_CHECKS.RETRY_BASE_DELAY_MS,
        maxDelayMs: config.PROPOSAL_CHECKS.RETRY_MAX_DELAY_MS,
        deadLetterQueue: EnumQueueName.proposalChecksDeadLetter,
      },
    }
  },
}

export default ProposalCheckQueue
