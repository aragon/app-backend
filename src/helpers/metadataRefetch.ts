import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EnumQueueName, type IQueueMetadataRefetch, type MetadataEntityType, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:MetadataRefetch' })

const MetadataRefetchHelper = {
  /**
   * Creates a MetadataRefetch record and pushes it to the queue for immediate retry
   */
  queueForRefetch: async (params: {
    metadataUri: string
    entityType: MetadataEntityType
    entityId: string
    network: NetworksEnum
  }): Promise<void> => {
    try {
      const { metadataUri, entityType, entityId, network } = params

      // Create or find existing record
      const refetchRecord = await Models.MetadataRefetch.findOrCreate({
        metadataUri,
        entityType,
        entityId,
        network,
      })

      // Only queue if the record is still pending (not already completed/discarded)
      if (refetchRecord.status !== 'pending') {
        logger.verbose('MetadataRefetch record already processed, skipping queue', llo({ id: refetchRecord.id }))
        return
      }

      // Push to queue for immediate retry
      const queuePayload: { id: string; params: IQueueMetadataRefetch } = {
        id: refetchRecord.id,
        params: {
          id: refetchRecord.id,
          metadataUri,
          entityType,
          entityId,
          network,
        },
      }

      await RabbitMQHelper.sendMessage(EnumQueueName.metadataRefetch, queuePayload)

      logger.info('Queued metadata for refetch', llo({ entityType, entityId, network, metadataUri }))
    } catch (error) {
      logger.error('Error queueing metadata for refetch', llo({ ...params, error }))
    }
  },

  /**
   * Creates a callback function to be used with IPFSModule.fetchMetadata's onFetchFailed option
   */
  createFailedCallback: (entityType: MetadataEntityType, entityId: string, network: NetworksEnum) => {
    return async (metadataUri: string): Promise<void> => {
      await MetadataRefetchHelper.queueForRefetch({
        metadataUri,
        entityType,
        entityId,
        network,
      })
    }
  },
}

export default MetadataRefetchHelper