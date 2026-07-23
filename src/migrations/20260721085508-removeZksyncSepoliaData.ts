import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: removeZksyncSepoliaData' })

// zksync-sepolia was removed from NetworksEnum (no longer offered in the app), so it is kept
// here as a literal. This purges every historical document indexed under that network across
// all collections, mirroring the tools/cleanDb.ts approach.
const REMOVED_NETWORK = 'zksync-sepolia'

export const removeZksyncSepoliaDataMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260721085508-removeZksyncSepoliaData' }))

    try {
      let totalDeleted = 0

      for (const [modelName, model] of Object.entries(Models)) {
        const dbModel = model as any
        if (typeof dbModel.deleteMany !== 'function') {
          logger.verbose(`Model ${modelName} does not support deleteMany, skipping`, llo())
          continue
        }

        const result = await dbModel.deleteMany({ network: REMOVED_NETWORK })
        totalDeleted += result.deletedCount || 0

        if (result.deletedCount) {
          logger.verbose(
            `Deleted ${result.deletedCount} documents from ${modelName} where network is ${REMOVED_NETWORK}`,
            llo(),
          )
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260721085508-removeZksyncSepoliaData', totalDeleted }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260721085508-removeZksyncSepoliaData', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default removeZksyncSepoliaDataMigration
