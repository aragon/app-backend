import ProposalCheckTriggers from '@modules/proposalChecks/triggers'

/** Task wrapper: one routing pass over what the indexer wrote since the last run. */
export const ProposalCheckTriggerRouter = {
  start: async (): Promise<void> => {
    await ProposalCheckTriggers.run()
  },
}
