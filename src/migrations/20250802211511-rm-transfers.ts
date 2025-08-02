import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'Migration: rm-transfers' })

export enum ITransferType {
  tokenTransfer = 'tokenTransfer',
}

export const rmTransfersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250802211511-rm-transfers' }))

    try {
      // Count documents to be deleted
      const countBefore = await Models.MemberTransaction.countDocuments({ type: ITransferType.tokenTransfer })
      logger.info('Documents to delete', llo({ count: countBefore }))

      if (countBefore > 0) {
        // Delete all MemberTransaction documents where type is tokenTransfer
        const deleteResult = await Models.MemberTransaction.deleteMany({ type: ITransferType.tokenTransfer })

        logger.info(
          'Deletion completed',
          llo({
            deletedCount: deleteResult.deletedCount,
            acknowledged: deleteResult.acknowledged,
          }),
        )

        // Verify deletion
        const countAfter = await Models.MemberTransaction.countDocuments({ type: ITransferType.tokenTransfer })
        logger.info(
          'Verification',
          llo({
            countBefore,
            countAfter,
            expectedAfter: 0,
          }),
        )

        if (countAfter !== 0) {
          throw new Error(`Expected 0 documents after deletion but found ${countAfter}`)
        }
      } else {
        logger.info('No documents to delete', llo({}))
      }

      logger.info('Migration completed successfully', llo({ migration: '20250802211511-rm-transfers' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250802211511-rm-transfers', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default rmTransfersMigration
