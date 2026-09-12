import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import ProposalCheckQueue from '@modules/proposalChecks/queue'
import { EnumQueueName, type IQueueProposalCheck } from '@types'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:consumer' })

/** Runs one assessment attempt on a claimed request; persisting the result is the executor's job. */
export type IProposalCheckExecutor = (request: ProposalAssessment) => Promise<void>

/**
 * Consumes `proposal.checks`. A delivery is acknowledged when its request is done, unknown or
 * being worked on under a live lease; an error is thrown back to the envelope, which owns
 * backoff, the attempt limit and the dead-letter queue. A request left running by a worker that
 * died is taken over once its lease expires.
 */
export const ProposalChecksConsumer = {
  start: async (executor: IProposalCheckExecutor): Promise<void> => {
    await RabbitMQHelper.process(
      EnumQueueName.proposalChecks,
      async (job: IQueueProposalCheck) => {
        await ProposalChecksConsumer.handle(job, executor)
      },
      ProposalCheckQueue.retryOptions(),
    )
  },

  handle: async (job: IQueueProposalCheck, executor: IProposalCheckExecutor): Promise<void> => {
    const requestId = job.params.requestId
    const request = await Models.ProposalAssessment.claim(requestId, config.PROPOSAL_CHECKS.LEASE_TTL_MS)
    if (!request) {
      logger.verbose(
        'proposal checks: request done, leased elsewhere or unknown, dropping delivery',
        llo({ requestId }),
      )
      return
    }

    try {
      await executor(request)
    } catch (error) {
      await request.markFailed(error)
      logger.error('proposal checks: attempt failed', llo({ requestId, attempt: request.attempts, error }))
      throw error
    }
  },
}
