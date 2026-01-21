import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import {
  EnumQueueName,
  type IQueueMetadataRefetch,
  MetadataEntityType,
  MetadataRefetchStatus,
  type NetworksEnum,
} from '@types'

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
      if (refetchRecord.status !== MetadataRefetchStatus.pending) {
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

  /**
   * Apply refetched metadata to the corresponding entity in the database.
   * Used by both the queue processor (immediate retry) and scheduled job (delayed retry).
   */
  applyRefetchedMetadata: async (
    entityType: MetadataEntityType,
    entityId: string,
    network: NetworksEnum,
    metadata: any,
  ): Promise<boolean> => {
    try {
      switch (entityType) {
        case MetadataEntityType.Dao:
          return await MetadataRefetchHelper._applyDaoMetadata(entityId, network, metadata)

        case MetadataEntityType.Plugin:
          return await MetadataRefetchHelper._applyPluginMetadata(entityId, network, metadata)

        case MetadataEntityType.Proposal:
          return await MetadataRefetchHelper._applyProposalMetadata(entityId, network, metadata)

        case MetadataEntityType.Gauge:
          return await MetadataRefetchHelper._applyGaugeMetadata(entityId, network, metadata)

        case MetadataEntityType.Campaign:
          return await MetadataRefetchHelper._applyCampaignMetadata(entityId, network, metadata)

        default:
          logger.warn('Unknown entity type for metadata update', llo({ entityType, entityId }))
          return false
      }
    } catch (error) {
      logger.error('Error applying refetched metadata', llo({ entityType, entityId, error }))
      return false
    }
  },

  _applyDaoMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
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

    logger.verbose('Applied refetched metadata to Dao', llo({ address, network }))
    return true
  },

  _applyPluginMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
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

    logger.verbose('Applied refetched metadata to Plugin', llo({ address, network }))
    return true
  },

  _applyProposalMetadata: async (proposalIndex: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
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

    logger.verbose('Applied refetched metadata to Proposal', llo({ proposalIndex, network }))
    return true
  },

  _applyGaugeMetadata: async (address: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
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

    logger.verbose('Applied refetched metadata to Gauge', llo({ address, network }))
    return true
  },

  _applyCampaignMetadata: async (campaignId: string, network: NetworksEnum, metadata: any): Promise<boolean> => {
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

    logger.verbose('Applied refetched metadata to Campaign', llo({ campaignId, network }))
    return true
  },
}

export default MetadataRefetchHelper
