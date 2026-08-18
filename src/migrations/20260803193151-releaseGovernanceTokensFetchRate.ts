import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: releaseGovernanceTokensFetchRate' })

const MIGRATION_NAME = '20260803193151-releaseGovernanceTokensFetchRate'

export const releaseGovernanceTokensFetchRateMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      // Governance tokens were permanently excluded from rate fetching when their first
      // CoinGecko lookup returned no price - a cost guard from the days when failed
      // provider requests consumed credits, which no longer applies. Release them back
      // into the fetch pool - unlisted ones decay to monthly checks via the fail-count backoff.
      const result = await Models.Token.updateMany(
        {
          skipFetchRate: true,
          isGovernance: true,
          symbol: { $nin: [null, ''] },
          type: { $ne: ITokenType.unknown },
          isSpam: { $ne: true },
          network: { $ne: NetworksEnum.ethereumSepolia },
        },
        {
          $set: {
            skipFetchRate: false,
            fetchRateFailCount: 0,
            nextFetchRateAt: null,
          },
        },
      )

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION_NAME, matched: result.matchedCount, updated: result.modifiedCount }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default releaseGovernanceTokensFetchRateMigration
