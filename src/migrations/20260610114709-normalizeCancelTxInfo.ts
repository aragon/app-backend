import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: normalizeCancelTxInfo' })

const MIGRATION = '20260610114709-normalizeCancelTxInfo'

/**
 * `cancelTxInfo` was declared as a Boolean prop (`default: false`) while the code
 * assigns a `TxInfo` object on proposalCanceled. After fixing the schema to a
 * `TxInfo` subdocument, documents persisted with the old Boolean default fail to
 * hydrate ("Tried to set nested object field `cancelTxInfo` to primitive value `false`"),
 * which rejects every subsequent save on those proposals.
 *
 * Normalizes any boolean `cancelTxInfo` to `null` (the new schema default) using raw
 * collection ops, since Mongoose-level reads would trip on the broken hydration.
 */
export const normalizeCancelTxInfoMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const filter = { cancelTxInfo: { $type: 'bool' } }

      const total = await Models.Proposal.collection.countDocuments(filter)
      logger.info('Affected proposal docs', llo({ total }))
      if (total === 0) {
        logger.info('No proposals to migrate', llo({}))
        return
      }

      const result = await Models.Proposal.collection.updateMany(filter, { $set: { cancelTxInfo: null } })

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION, matched: result.matchedCount, modified: result.modifiedCount }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default normalizeCancelTxInfoMigration
