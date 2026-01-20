import config from '@config'
import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { MetadataEntityType, type NetworksEnum } from '@types'

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
      // Success - update the entity
      const updated = await MetadataRefetchScheduler._updateEntity(entityType, entityId, network, metadata)

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

  /**
   * Update the entity with the fetched metadata
   */
  _updateEntity: async (
    entityType: MetadataEntityType,
    entityId: string,
    network: NetworksEnum,
    metadata: any,
  ): Promise<boolean> => {
    try {
      switch (entityType) {
        case MetadataEntityType.Dao:
          return await MetadataRefetchScheduler._updateDaoMetadata(entityId, network, metadata)

        case MetadataEntityType.Plugin:
          return await MetadataRefetchScheduler._updatePluginMetadata(entityId, network, metadata)

        case MetadataEntityType.Proposal:
          return await MetadataRefetchScheduler._updateProposalMetadata(entityId, network, metadata)

        case MetadataEntityType.Gauge:
          return await MetadataRefetchScheduler._updateGaugeMetadata(entityId, network, metadata)

        case MetadataEntityType.Campaign:
          return await MetadataRefetchScheduler._updateCampaignMetadata(entityId, network, metadata)

        default:
          logger.warn('Unknown entity type for metadata update', llo({ entityType, entityId }))
          return false
      }
    } catch (error) {
      logger.error('Error updating entity metadata', llo({ entityType, entityId, error }))
      return false
    }
  },

  _updateDaoMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const dao = await Models.Dao.findByAddress(address, network)
    if (!dao) {
      logger.warn('Dao not found for metadata update', llo({ address, network }))
      return false
    }

    await dao.update({
      name: metadata.name,
      description: metadata.description,
      avatar: Utils.parseAvatar(metadata.avatar),
      links: metadata.links,
    })

    logger.verbose('Updated Dao metadata via scheduler', llo({ address, network }))
    return true
  },

  _updatePluginMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const plugin = await Models.Plugin.findByAddress(address, network)
    if (!plugin) {
      logger.warn('Plugin not found for metadata update', llo({ address, network }))
      return false
    }

    await plugin.update({
      name: metadata.name,
      description: metadata.description,
      links: metadata.links,
      processKey: metadata.processKey,
      blockedCountries: metadata.blockedCountries || [],
      termsConditionsUrl: metadata.termsConditionsUrl || null,
      enableOfacCheck: metadata.enableOfacCheck || null,
    })

    logger.verbose('Updated Plugin metadata via scheduler', llo({ address, network }))
    return true
  },

  _updateProposalMetadata: async (proposalIndex: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const parsedMetadata = Web3Utils.parseProposalMetadata(metadata)
    if (!parsedMetadata) {
      logger.warn('Failed to parse proposal metadata', llo({ proposalIndex, network }))
      return false
    }

    const proposal = await Models.Proposal.findOne({ proposalIndex, network })
    if (!proposal) {
      logger.warn('Proposal not found for metadata update', llo({ proposalIndex, network }))
      return false
    }

    await proposal.update({
      title: parsedMetadata.title,
      description: parsedMetadata.description,
      summary: parsedMetadata.summary,
      resources: parsedMetadata.resources,
      media: parsedMetadata.media,
    })

    logger.verbose('Updated Proposal metadata via scheduler', llo({ proposalIndex, network }))
    return true
  },

  _updateGaugeMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const gauge = await Models.Gauge.findOne({ address, network })
    if (!gauge) {
      logger.warn('Gauge not found for metadata update', llo({ address, network }))
      return false
    }

    await gauge.update({
      name: metadata.name,
      description: metadata.description,
      links: metadata.links,
      avatar: metadata.avatar,
    })

    logger.verbose('Updated Gauge metadata via scheduler', llo({ address, network }))
    return true
  },

  _updateCampaignMetadata: async (campaignId: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const parsedMetadata = Web3Utils.parseCampaignMetadata(metadata)
    if (!parsedMetadata) {
      logger.warn('Failed to parse campaign metadata', llo({ campaignId, network }))
      return false
    }

    const campaign = await Models.Campaign.findOne({ campaignId, network })
    if (!campaign) {
      logger.warn('Campaign not found for metadata update', llo({ campaignId, network }))
      return false
    }

    await campaign.updateMetadata({
      title: parsedMetadata.title,
      description: parsedMetadata.description,
      resources: parsedMetadata.resources,
      type: parsedMetadata.type,
    })

    logger.verbose('Updated Campaign metadata via scheduler', llo({ campaignId, network }))
    return true
  },
}
