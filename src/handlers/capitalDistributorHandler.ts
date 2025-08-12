import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import IPFSModule from '@modules/ipfs'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'handlers:CapitalDistributorHandler' })

export const CapitalDistributorHandler = {
  campaignCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network, blockNumber, transactionHash } = info

    const plugin = await Models.Plugin.findByAddress(address, network)
    const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)
    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const {
        campaignId,
        metadataURI,
        allocationStrategy,
        token,
        actionEncoder,
        multipleClaimsAllowed,
        startTime,
        endTime,
      } = parsedEvent.args

      const campaignData = {
        pluginAddress: address,
        network,
        transactionHash,
        blockNumber,
        blockTimestamp,
        campaignId: campaignId.toString(),
        metadataURI,
        allocationStrategy,
        token,
        payoutEncoder: actionEncoder,
        multipleClaimsAllowed,
        startTime: startTime.toNumber(),
        endTime: endTime.toNumber(),
        active: true,
      }

      const existingCampaign = await Models.Campaign.findExisting({
        pluginAddress: address,
        network,
        campaignId: campaignId.toString(),
      })

      if (existingCampaign) {
        logger.info('Campaign already exists', llo({ campaignId: campaignId.toString(), address, network }))
        return
      }

      const campaign = await Models.Campaign.create(campaignData)

      logger.info(
        'Campaign created',
        llo({
          campaignId: campaignId.toString(),
          address,
          network,
          metadataURI,
          token,
        }),
      )

      // Fetch and parse metadata from IPFS
      const rawMetadata = await IPFSModule.fetchMetadata(metadataURI, { retries: 4 })
      if (rawMetadata) {
        const parsedMetadata = IPFSModule.parseCapitalDistributorMetadata(rawMetadata)
        
        // Update campaign with basic metadata (name, description, links)
        const campaignMetadata = {
          name: parsedMetadata.name,
          description: parsedMetadata.description,
          links: parsedMetadata.links,
        }
        await campaign.updateMetadata(campaignMetadata)

        // Store plugin-specific metadata in logMetadata
        const logMetadata = {
          id: Models.LogMetadata.getEntityId({
            network,
            transactionHash,
            transactionIndex: 0, // We'll use 0 for campaign creation events
            logIndex: 0,
          }),
          transactionHash,
          blockNumber,
          transactionIndex: 0,
          logIndex: 0,
          network,
          pluginAddress: address,
          metadataUri: metadataURI,
          name: parsedMetadata.name,
          description: parsedMetadata.description,
          links: parsedMetadata.links.map(url => ({ name: '', url })),
          blockedCountries: parsedMetadata.blockedCountries,
          termsConditionsUrl: parsedMetadata.termsConditionsUrl,
          enableOfacCheck: parsedMetadata.enableOfacCheck,
        }

        await Models.LogMetadata.create(logMetadata)

        logger.info(
          'Campaign and plugin metadata updated',
          llo({
            campaignId: campaignId.toString(),
            campaignMetadata: !!parsedMetadata.name || !!parsedMetadata.description,
            pluginMetadata: parsedMetadata.blockedCountries.length > 0 || !!parsedMetadata.termsConditionsUrl,
          }),
        )
      }
    } catch (error) {
      logger.error('Error processing CampaignCreated event', llo({ error, info }))
      throw error
    }
  },

  campaignDeactivated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const { campaignId } = parsedEvent.args

      const campaign = await Models.Campaign.findCampaignById(address, network, campaignId.toString())

      if (!campaign) {
        logger.warn(
          'Campaign not found for deactivation',
          llo({
            campaignId: campaignId.toString(),
            address,
            network,
          }),
        )
        return
      }

      await campaign.update({ active: false })

      logger.info(
        'Campaign deactivated',
        llo({
          campaignId: campaignId.toString(),
          address,
          network,
        }),
      )
    } catch (error) {
      logger.error('Error processing CampaignDeactivated event', llo({ error, info }))
      throw error
    }
  },

  merkleCampaignSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const { campaignId, merkleRoot } = parsedEvent.args

      const campaign = await Models.Campaign.findCampaignById(address, network, campaignId.toString())

      if (!campaign) {
        logger.warn(
          'Campaign not found for merkle root update',
          llo({
            campaignId: campaignId.toString(),
            address,
            network,
          }),
        )
        return
      }

      await campaign.updateMerkleRoot(merkleRoot)

      logger.info(
        'Merkle root set for campaign',
        llo({
          campaignId: campaignId.toString(),
          address,
          network,
          merkleRoot,
        }),
      )
    } catch (error) {
      logger.error('Error processing MerkleCampaignSet event', llo({ error, info }))
      throw error
    }
  },

  merkleCampaignUpdated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const { campaignId, newMerkleRoot } = parsedEvent.args

      const campaign = await Models.Campaign.findCampaignById(address, network, campaignId.toString())

      if (!campaign) {
        logger.warn(
          'Campaign not found for merkle root update',
          llo({
            campaignId: campaignId.toString(),
            address,
            network,
          }),
        )
        return
      }

      await campaign.updateMerkleRoot(newMerkleRoot)

      logger.info(
        'Merkle root updated for campaign',
        llo({
          campaignId: campaignId.toString(),
          address,
          network,
          newMerkleRoot,
        }),
      )
    } catch (error) {
      logger.error('Error processing MerkleCampaignUpdated event', llo({ error, info }))
      throw error
    }
  },

  payoutClaimed: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network, blockNumber, transactionHash } = info

    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const { campaignId, recipient, amount, totalClaimed } = parsedEvent.args

      let reward = await Models.Reward.findRewardForCampaign(address, network, campaignId.toString(), recipient)

      if (!reward) {
        reward = await Models.Reward.create({
          pluginAddress: address,
          network,
          campaignId: campaignId.toString(),
          userAddress: recipient,
          amount: '0',
        })
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)

      await reward.addClaim(amount.toString(), transactionHash, blockNumber, blockTimestamp)

      logger.info(
        'Payout claimed',
        llo({
          campaignId: campaignId.toString(),
          recipient,
          amount: amount.toString(),
          totalClaimed: totalClaimed.toString(),
          address,
          network,
        }),
      )
    } catch (error) {
      logger.error('Error processing PayoutClaimed event', llo({ error, info }))
      throw error
    }
  },

}
