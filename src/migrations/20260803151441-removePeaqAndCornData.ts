import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: removePeaqAndCornData' })

const REMOVED_NETWORKS = ['peaq-mainnet', 'corn-mainnet']

export const removePeaqAndCornDataMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260803151441-removePeaqAndCornData' }))

    try {
      let totalDeleted = 0

      for (const [modelName, model] of Object.entries(Models)) {
        const dbModel = model as any
        if (typeof dbModel.deleteMany !== 'function') {
          logger.verbose(`Model ${modelName} does not support deleteMany, skipping`, llo())
          continue
        }

        const result = await dbModel.deleteMany({ network: { $in: REMOVED_NETWORKS } })
        totalDeleted += result.deletedCount || 0

        if (result.deletedCount) {
          logger.verbose(
            `Deleted ${result.deletedCount} documents from ${modelName} where network is one of ${REMOVED_NETWORKS.join(', ')}`,
            llo(),
          )
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260803151441-removePeaqAndCornData', totalDeleted }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260803151441-removePeaqAndCornData', error }))
      throw error
    }
  },

  stop: async () => {
  },
}

export default removePeaqAndCornDataMigration
