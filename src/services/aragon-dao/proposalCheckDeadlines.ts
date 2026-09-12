import ProposalCheckDeadlines from '@modules/proposalChecks/deadlines'

/** Task wrapper: one pass over the proposals whose next readiness boundary has passed. */
export const ProposalCheckDeadlineTask = {
  start: async (): Promise<void> => {
    await ProposalCheckDeadlines.run()
  },
}
