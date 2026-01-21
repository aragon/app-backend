import config from '@config'
import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { type IQueueMetadataRefetch, MetadataRefetchStatus } from '@types'

const llo = logger.logMeta.bind(null, { service: 'gateway:MetadataRefetch' })

export const MetadataRefetchProcessor = {
  /**
   * Process a metadata refetch request from the queue
   * This is called for immediate retries after initial fetch failure
   */
  processRefetch: async (params: IQueueMetadataRefetch): Promise<boolean> => {
    const { id, metadataUri, entityType, entityId, network } = params

    try {
      // Find the refetch record
      const refetchRecord = await Models.MetadataRefetch.findByEntityId(id)
      if (!refetchRecord) {
        logger.warn('MetadataRefetch record not found', llo({ id }))
        return false
      }

      // Skip if already completed or discarded
      if (refetchRecord.status !== MetadataRefetchStatus.pending) {
        logger.verbose('MetadataRefetch record already processed', llo({ id, status: refetchRecord.status }))
        return true
      }

      // Mark attempt
      await refetchRecord.markAttempt()

      // Try to fetch metadata with more retries for the queue consumer
      const metadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 4 })

      if (metadata) {
        // Success - update the entity using shared helper
        const updated = await MetadataRefetchHelper.applyRefetchedMetadata(entityType, entityId, network, metadata)

        if (updated) {
          await refetchRecord.markCompleted()
          logger.info('MetadataRefetch completed successfully', llo({ id, entityType, entityId }))
          return true
        }
      }

      // Check if we've exceeded max retries
      if (refetchRecord.retryCount >= config.IPFS.METADATA_REFETCH_MAX_RETRY) {
        await refetchRecord.markDiscarded()
        logger.warn('MetadataRefetch discarded after max retries', llo({ id, retryCount: refetchRecord.retryCount }))
        return false
      }

      // Still pending - will be picked up by scheduled job later
      logger.verbose(
        'MetadataRefetch still pending, will retry later',
        llo({ id, retryCount: refetchRecord.retryCount }),
      )
      return false
    } catch (error) {
      logger.error('Error processing metadata refetch', llo({ id, error }))
      return false
    }
  },
}
