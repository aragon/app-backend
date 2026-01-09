import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: removeDaoTransactions' })

export const removeDaoTransactionsMigration: IMigration = {
  start: async () => {
    logger.info(
      'Starting migration to remove DAO transactions',
      llo({ migration: '20250828132611-removeDaoTransactions' }),
    )

    try {
      // Step 1: Delete all Transaction records
      const transactionDeleteResult = await Models.Transaction.deleteMany({})
      logger.info(
        'Deleted all Transaction records',
        llo({
          deletedCount: transactionDeleteResult.deletedCount,
          migration: '20250828132611-removeDaoTransactions',
        }),
      )

      // Step 2: Delete ConfigIndexer entries related to transaction syncing
      // These entries follow the pattern:
      // - deposit-{network}-{daoAddress}-depositTxs
      // - withdraw-{network}-{daoAddress}-withdrawTxs

      const configIndexerDeleteResult = await Models.ConfigIndexer.deleteMany({
        $or: [
          // Old format with -depositTxs and -withdrawTxs suffix
          { service: { $regex: '^deposit-.*-depositTxs$' } },
          { service: { $regex: '^withdraw-.*-withdrawTxs$' } },
        ],
      })

      logger.info(
        'Deleted ConfigIndexer entries for transaction syncing',
        llo({
          deletedCount: configIndexerDeleteResult.deletedCount,
          migration: '20250828132611-removeDaoTransactions',
        }),
      )

      logger.info(
        'Migration completed successfully. Transaction data will be resynced on next app start.',
        llo({
          migration: '20250828132611-removeDaoTransactions',
          transactionsDeleted: transactionDeleteResult.deletedCount,
          configIndexersDeleted: configIndexerDeleteResult.deletedCount,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250828132611-removeDaoTransactions', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default removeDaoTransactionsMigration
