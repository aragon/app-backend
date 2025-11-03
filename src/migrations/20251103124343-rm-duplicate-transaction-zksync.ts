import { type IMigration, ITransactionType, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'Migration: rm-duplicate-transaction-zksync' })

export const rmDuplicateTransactionZksyncMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20251103124343-rm-duplicate-transaction-zksync' }))

    try {
      await Models.Transaction.deleteMany({
        network: NetworksEnum.zksyncMainnet,
        type: ITransactionType.native,
      })

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20251103124343-rm-duplicate-transaction-zksync' }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20251103124343-rm-duplicate-transaction-zksync', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default rmDuplicateTransactionZksyncMigration
