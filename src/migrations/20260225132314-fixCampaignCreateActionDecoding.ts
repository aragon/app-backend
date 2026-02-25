import { Models } from '@dbModels'
import logger from '@logger'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixCampaignCreateActionDecoding' })

const CAMPAIGN_CREATE_SELECTOR = '^0x3d4ebc5b'

export const fixCampaignCreateActionDecodingMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260225132314-fixCampaignCreateActionDecoding' }))

    try {
      const proposals = await Models.Proposal.find({
        rawActions: {
          $elemMatch: {
            data: { $regex: `${CAMPAIGN_CREATE_SELECTOR}` },
          },
        },
      })

      logger.info(`Found ${proposals.length} proposals with createCampaign actions`, llo({ count: proposals.length }))

      if (proposals.length === 0) {
        logger.info('No proposals to migrate', llo({}))
        return
      }

      let processedCount = 0
      for (const proposal of proposals) {
        const campaignAction = proposal.actions.find((action: any) => action.data.match(CAMPAIGN_CREATE_SELECTOR))

        if (!campaignAction || campaignAction.inputData?.parameters?.length !== 4) {
          await ProposalHandler.parseActions(proposal)
          processedCount++
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260225132314-fixCampaignCreateActionDecoding', processedProposals: processedCount }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260225132314-fixCampaignCreateActionDecoding', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default fixCampaignCreateActionDecodingMigration
