import config from '@config'
import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import IPFSModule from '@modules/ipfs'
import { type IQueueMetadataRefetch, MetadataEntityType, MetadataRefetchStatus, type NetworksEnum } from '@types'

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
        // Success - update the entity
        const updated = await MetadataRefetchProcessor._updateEntity(entityType, entityId, network, metadata)

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
          return await MetadataRefetchProcessor._updateDaoMetadata(entityId, network, metadata)

        case MetadataEntityType.Plugin:
          return await MetadataRefetchProcessor._updatePluginMetadata(entityId, network, metadata)

        case MetadataEntityType.Proposal:
          return await MetadataRefetchProcessor._updateProposalMetadata(entityId, network, metadata)

        case MetadataEntityType.Gauge:
          return await MetadataRefetchProcessor._updateGaugeMetadata(entityId, network, metadata)

        case MetadataEntityType.Campaign:
          return await MetadataRefetchProcessor._updateCampaignMetadata(entityId, network, metadata)

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

    logger.verbose('Updated Dao metadata', llo({ address, network }))
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

    logger.verbose('Updated Plugin metadata', llo({ address, network }))
    return true
  },

  _updateProposalMetadata: async (proposalIndex: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    // proposalIndex is the entityId for proposals
    // We need to find the proposal - the entityId format should be "proposalIndex" that was passed
    const parsedMetadata = Web3Utils.parseProposalMetadata(metadata)
    if (!parsedMetadata) {
      logger.warn('Failed to parse proposal metadata', llo({ proposalIndex, network }))
      return false
    }

    // Find proposal by proposalIndex and network
    // Note: We need to find it across all plugins, so we use a broader query
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

    logger.verbose('Updated Proposal metadata', llo({ proposalIndex, network }))
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

    logger.verbose('Updated Gauge metadata', llo({ address, network }))
    return true
  },

  _updateCampaignMetadata: async (campaignId: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
    const parsedMetadata = Web3Utils.parseCampaignMetadata(metadata)
    if (!parsedMetadata) {
      logger.warn('Failed to parse campaign metadata', llo({ campaignId, network }))
      return false
    }

    // Find campaign by campaignId and network
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

    logger.verbose('Updated Campaign metadata', llo({ campaignId, network }))
    return true
  },
}
