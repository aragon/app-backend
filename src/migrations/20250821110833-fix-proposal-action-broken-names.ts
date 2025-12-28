import { Models } from '@dbModels'
import logger from '@logger'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { type IMigration, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: fix-proposal-action-broken-names' })

export const fixProposalActionBrokenNamesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250821110833-fix-proposal-action-broken-names' }))

    try {
      const proposals = await Models.Proposal.find({
        network: { $in: [NetworksEnum.zksyncMainnet, NetworksEnum.ethereumMainnet] },
        $or: [{ 'actions.inputData.contract': { $regex: ':' } }, { 'actions.inputData.proxyName': { $regex: ':' } }],
      })

      logger.info(`Found ${proposals.length} proposals with broken action names`, llo({ proposals: proposals.length }))

      if (proposals.length === 0) {
        logger.info('No proposals to migrate', llo({}))
        return
      }

      let counter = 0
      for (const proposal of proposals) {
        counter++
        await ProposalHandler.parseActions(proposal)
        logger.info(`Processed ${counter} proposals`, llo({ counter, remaining: proposals.length - counter }))
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20250821110833-fix-proposal-action-broken-names', processedProposals: counter }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250821110833-fix-proposal-action-broken-names', error }))
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default fixProposalActionBrokenNamesMigration
