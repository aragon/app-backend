import config from '@config'
import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'

const llo = logger.logMeta.bind(null, { service: 'rates:MetadataRefetch' })

export const MetadataRefetchScheduler = {
  /**
   * Start the scheduled metadata refetch job
   * Queries pending records where retryCount > 0 and lastAttemptAt < 30 min ago
   */
  start: async () => {
    logger.info('Starting MetadataRefetchScheduler', llo({}))

    try {
      // Find all pending records ready for retry
      const pendingRecords = await Models.MetadataRefetch.findPendingForRetry(config.IPFS.METADATA_REFETCH_INTERVAL_MS)

      if (pendingRecords.length === 0) {
        logger.verbose('No pending metadata refetch records to process', llo({}))
        return
      }

      logger.info(
        `Found ${pendingRecords.length} pending metadata refetch records`,
        llo({ count: pendingRecords.length }),
      )

      // Process each record sequentially to avoid overwhelming IPFS
      for (const record of pendingRecords) {
        try {
          await MetadataRefetchScheduler._processRecord(record)
        } catch (error) {
          logger.error('Error processing metadata refetch record', llo({ id: record.id, error }))
        }
      }

      logger.info('MetadataRefetchScheduler completed', llo({}))
    } catch (error) {
      logger.error('Error in MetadataRefetchScheduler', llo({ error }))
    }
  },

  /**
   * Process a single metadata refetch record
   */
  _processRecord: async (record: any): Promise<void> => {
    const { id, metadataUri, entityType, entityId, network, retryCount } = record

    // Mark the attempt
    await record.markAttempt()

    // Try to fetch metadata
    const metadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 4 })

    if (metadata) {
      // Success - update the entity using shared helper
      const updated = await MetadataRefetchHelper.applyRefetchedMetadata(entityType, entityId, network, metadata)

      if (updated) {
        await record.markCompleted()
        logger.info('Scheduled MetadataRefetch completed successfully', llo({ id, entityType, entityId }))
        return
      }
    }

    // Check if we've exceeded max retries (retryCount was already incremented by markAttempt)
    if (retryCount + 1 >= config.IPFS.METADATA_REFETCH_MAX_RETRY) {
      await record.markDiscarded()
      logger.warn('Scheduled MetadataRefetch discarded after max retries', llo({ id, retryCount: retryCount + 1 }))
      return
    }

    // Still pending - will be picked up in next scheduled run
    logger.verbose('Scheduled MetadataRefetch still pending', llo({ id, retryCount: retryCount + 1 }))
  },
}
