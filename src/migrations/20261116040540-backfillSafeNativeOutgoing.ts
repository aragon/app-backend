import { Models } from '@dbModels'
import logger from '@logger'
import SafeNativeTransfersModule from '@modules/safe/safeNativeTransfers'
import type { IMigration } from '@types'

const MIGRATION = '20261116040540-backfillSafeNativeOutgoing'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const backfillSafeNativeOutgoingMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const safes = await Models.SafeAccount.find({ tracked: true }).select('network safeAddress').lean()
      for (const { network, safeAddress } of safes) {
        await SafeNativeTransfersModule.sync(network, safeAddress)
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, safes: safes.length }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillSafeNativeOutgoingMigration
