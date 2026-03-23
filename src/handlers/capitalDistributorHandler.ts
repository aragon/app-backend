import { Models } from '@dbModels'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { LogCampaignStrategy } from '@services/aragon-plugins/logCampaignStrategy'
import { type ILogInfo, MetadataEntityType } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:CapitalDistributorHandler' })

export const CapitalDistributorHandler = {
  campaignCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network, blockNumber, transactionHash } = info

    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    try {
      const { campaignId, metadataUri, allocationStrategy, token, actionEncoder, startTime, endTime } = parsedEvent.args
      const campaignMetadataUrl = Web3Utils.extractMetadataUri(metadataUri)!

      const existingCampaign = await Models.Campaign.findExisting({
        pluginAddress: address,
        network,
        campaignId: campaignId.toString(),
      })

      if (existingCampaign) {
        logger.warn('Campaign already exists', llo({ campaignId: campaignId.toString(), address, network }))
        return
      }

      const campaignData = {
        pluginAddress: address,
        network,
        transactionHash,
        blockNumber,
        blockTimestamp: await info.context!.getBlockTimestamp(blockNumber),
        campaignId: campaignId.toString(),
        metadataURI: campaignMetadataUrl,
        allocationStrategy,
        token,
        payoutEncoder: actionEncoder,
        startTime: Number(startTime),
        endTime: Number(endTime),
        active: true,
      }

      const campaign = await Models.Campaign.create(campaignData)

      await ProxyToken.saveAndGetToken(token, network)

      const rawMetadata = await IPFSModule.fetchMetadata(campaignMetadataUrl, {
        retries: 2,
        onFetchFailed: MetadataRefetchHelper.createFailedCallback(
          MetadataEntityType.Campaign,
          campaignId.toString(),
          network,
        ),
      })
      if (rawMetadata) {
        const parsedMetadata = Web3Utils.parseCampaignMetadata(rawMetadata)

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

      const totalRewards = await Models.CampaignReward.calculateTotalRewards(address, network, campaignId.toString())

      await campaign.updateTotalRewards(totalRewards)
      await LogCampaignStrategy.start(allocationStrategy, network, blockNumber)
    } catch (error) {
      logger.error('Error processing CampaignCreated event', llo({ error, info }))
    }
  },

  merkleCampaignSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    try {
      const { campaignId, merkleRoot } = parsedEvent.args
      const realCampaignId = campaignId.toString()

      const campaign = await Models.Campaign.findOne({
        allocationStrategy: address,
        network,
        campaignId: realCampaignId,
      })

      if (!campaign) {
        logger.warn(
          'Campaign not found for merkle root update',
          llo({
            campaignId: realCampaignId,
            address,
            network,
          }),
        )
        return
      }

      const existingMerkleData = await Models.CampaignMerkleRoot.findOne({
        pluginAddress: campaign.pluginAddress,
        network,
        campaignId: realCampaignId,
      })

      if (!existingMerkleData) {
        const draftMerkleData = await Models.CampaignMerkleRoot.findDraftByMerkleRoot(
          campaign.pluginAddress,
          network,
          merkleRoot,
        )

        if (draftMerkleData) {
          const draftCampaignId = draftMerkleData.campaignId

          await DbTx.executeTxFn(async ({ session }) => {
            await Models.CampaignReward.reconcileDraftCampaignId(
              campaign.pluginAddress,
              network,
              draftCampaignId,
              realCampaignId,
              { session },
            )

            await draftMerkleData.update({ campaignId: realCampaignId, isDraft: false }, { session })

            const totalRewards = await Models.CampaignReward.calculateTotalRewards(
              campaign.pluginAddress,
              network,
              realCampaignId,
              { session },
            )

            await campaign.updateTotalRewards(totalRewards, { session })

            await DbTx.safeCommit(session)
          })

          logger.info(
            'Reconciled draft campaign to real campaignId',
            llo({
              draftCampaignId,
              realCampaignId,
              address,
              network,
              merkleRoot,
            }),
          )
        }
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
      const { campaignId, recipient, amount } = parsedEvent.args

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

      const alreadyExistingClaim = reward.claims.find((claim: any) => claim.transactionHash === transactionHash)
      if (alreadyExistingClaim) {
        return
      }

      const blockTimestamp = await info.context!.getBlockTimestamp(blockNumber)

      await reward.addClaim(amount.toString(), transactionHash, blockNumber, blockTimestamp)

      const campaign = await Models.Campaign.findCampaignById(address, network, campaignId.toString())
      if (campaign) {
        await campaign.incrementClaimCount()
        await campaign.addToTotalClaimed(amount.toString())
      }

      logger.info(
        'Payout claimed',
        llo({
          campaignId: campaignId.toString(),
          recipient,
          amount: amount.toString(),
          address,
          network,
        }),
      )
    } catch (error) {
      logger.error('Error processing PayoutClaimed event', llo({ error, info }))
    }
  },

  updateCampaignActiveState: async (address: string, network: string, campaignId: string, active: boolean) => {
    const plugin = await Models.Plugin.findByAddress(address, network)

    if (!plugin) {
      logger.warn('Plugin not found', llo({ address, network, campaignId }))
      return
    }

    try {
      const campaign = await Models.Campaign.findCampaignById(address, network, campaignId)

      if (!campaign) {
        logger.warn(
          'Campaign not found for',
          llo({
            campaignId,
            address,
            network,
          }),
        )
        return
      }

      await campaign.update({ active })

      logger.info(
        'Campaign status updated',
        llo({
          campaignId,
          address,
          network,
          active,
        }),
      )

      return campaign
    } catch (error) {
      logger.error('Error processing Campaign event', llo({ error, address, network, campaignId }))
    }
  },

  campaignPaused: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { campaignId } = parsedEvent.args
    await CapitalDistributorHandler.updateCampaignActiveState(address, network, campaignId.toString(), false)
  },

  campaignResumed: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { campaignId } = parsedEvent.args
    await CapitalDistributorHandler.updateCampaignActiveState(address, network, campaignId.toString(), true)
  },

  campaignEnded: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info
    const { campaignId } = parsedEvent.args
    const campaign = await CapitalDistributorHandler.updateCampaignActiveState(
      address,
      network,
      campaignId.toString(),
      false,
    )

    await campaign?.update({ ended: true })
  },
}
