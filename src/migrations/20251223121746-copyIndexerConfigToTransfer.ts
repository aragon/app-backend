import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'Migration: copyIndexerConfigToTransfer' })

export const copyIndexerConfigToTransferMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20251223121746-copyIndexerConfigToTransfer' }))

    try {
      const ConfigIndexer = Models.ConfigIndexer

      // Find all indexer-{network} entries
      const indexerConfigs = await ConfigIndexer.find({
        service: { $regex: /^indexer-/ },
      })

      logger.info('Found indexer configs to copy', llo({ count: indexerConfigs.length }))

      for (const config of indexerConfigs) {
        // Replace 'indexer-' with 'transfer-' in the service name
        const transferService = config.service.replace(/^indexer-/, 'transfer-')
        const transferId = `${config.network}-${transferService}`

        // Check if the transfer config already exists
        const existingTransfer = await ConfigIndexer.findOne({ id: transferId })
        if (existingTransfer) {
          logger.info(
            'Transfer config already exists, skipping',
            llo({ service: transferService, network: config.network }),
          )
          continue
        }

        // Create new transfer config with same lastSync
        await ConfigIndexer.create({
          network: config.network,
          service: transferService,
          lastSync: config.lastSync,
          end: config.end,
        })

        logger.info(
          'Created transfer config',
          llo({
            service: transferService,
            network: config.network,
            lastSync: config.lastSync,
          }),
        )
      }

      logger.info('Migration completed successfully', llo({ migration: '20251223121746-copyIndexerConfigToTransfer' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20251223121746-copyIndexerConfigToTransfer', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default copyIndexerConfigToTransferMigration
