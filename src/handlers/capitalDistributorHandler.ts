import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'

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

      const rawMetadata = await IPFSModule.fetchMetadata(metadataURI, { retries: 4 })
      if (rawMetadata) {
        const parsedMetadata = Web3Utils.parseCapitalDistributionMetadata(rawMetadata)

        const campaignMetadata = {
          title: parsedMetadata.title,
          description: parsedMetadata.description,
          resources: parsedMetadata.resources,
          type: parsedMetadata.type,
        }
        await campaign.updateMetadata(campaignMetadata)
      }

      logger.info(
        'Campaign Created. Starting allocation strategy crawler',
        llo({
          campaignId: campaignId.toString(),
          allocationStrategy,
          network,
        }),
      )

      try {
        await LogCampaignStrategy.start(allocationStrategy, network, blockNumber)
      } catch (error) {
        logger.error(
          'Error starting allocation strategy crawler',
          llo({
            error,
            campaignId: campaignId.toString(),
            allocationStrategy,
            network,
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

    try {
      const { campaignId, merkleRoot } = parsedEvent.args

      const campaign = await Models.Campaign.findOne({
        allocationStrategy: address,
        network,
        campaignId: campaignId.toString(),
      })

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

    try {
      const { campaignId, newMerkleRoot } = parsedEvent.args

      const campaign = await Models.Campaign.findOne({
        allocationStrategy: address,
        network,
        campaignId: campaignId.toString(),
      })

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

      let reward = await Models.CampaignReward.findRewardForCampaign(address, network, campaignId.toString(), recipient)

      if (!reward) {
        reward = await Models.CampaignReward.create({
          pluginAddress: address,
          network,
          campaignId: campaignId.toString(),
          userAddress: recipient,
          amount,
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
