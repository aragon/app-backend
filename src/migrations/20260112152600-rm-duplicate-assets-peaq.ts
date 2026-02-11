import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: rm-duplicate-assets-peaq' })

export const rmDuplicateAssetsPeaqMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260112152600-rm-duplicate-assets-peaq' }))

    try {
      await Models.Asset.deleteMany({
        network: NetworksEnum.peaqMainnet,
        tokenAddress: '0x0000000000000000000000000000000000000809',
      })

      logger.info('Migration completed successfully', llo({ migration: '20260112152600-rm-duplicate-assets-peaq' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260112152600-rm-duplicate-assets-peaq', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default rmDuplicateAssetsPeaqMigration
