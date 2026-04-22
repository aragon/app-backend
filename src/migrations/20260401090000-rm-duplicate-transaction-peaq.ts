import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, ITransactionType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: rm-duplicate-transaction-peaq' })

export const rmDuplicateTransactionPeaqMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260401090000-rm-duplicate-transaction-peaq' }))

    try {
      const result = await Models.Transaction.deleteMany({
        network: NetworksEnum.peaqMainnet,
        type: ITransactionType.native,
      })

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260401090000-rm-duplicate-transaction-peaq', deletedCount: result.deletedCount }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260401090000-rm-duplicate-transaction-peaq', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default rmDuplicateTransactionPeaqMigration
