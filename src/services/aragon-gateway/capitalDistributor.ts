import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import {
  CampaignPrepareStatus,
  type HexAddress,
  IPluginInterfaceType,
  type IPrepareCampaignFromGauge,
  type NetworksEnum,
} from '@types'
import { Contract, getAddress } from 'ethers'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'CapitalDistributorGateway' })

const CapitalDistributorGateway = {
  prepareCampaignFromGauge: async (params: IPrepareCampaignFromGauge): Promise<void> => {
    const startTime = Date.now()
    const { prepareId, daoAddress, network, capitalDistributorAddress, gaugePluginAddress, tokenAddress, totalAmount } =
      params

    try {
      const campaignPrepare = await Models.CampaignPrepare.findByPrepareId(prepareId)
      if (!campaignPrepare) {
        logger.error('CampaignPrepare not found', llo({ prepareId }))
        return
      }
      await campaignPrepare.update({ status: CampaignPrepareStatus.processing })

      let epochId = params.epochId
      if (!epochId) {
        const currentEpochId = await GaugeHelper.getGaugeEpochId(gaugePluginAddress, network)
        if (!currentEpochId) {
          logger.warn('Failed to get current epoch', llo({ prepareId, gaugePluginAddress }))
          await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
          return
        }
        epochId = currentEpochId
        await campaignPrepare.update({ epochId })
      }

      const campaignId = await Web3Helper.getNumCampaigns(capitalDistributorAddress, network)

      const daoTokenBalance = await Web3Helper.getTokenBalance(daoAddress, tokenAddress, network)

      if (BigInt(daoTokenBalance) < BigInt(totalAmount)) {
        logger.warn('Insufficient token balance', llo({ prepareId, daoTokenBalance, totalAmount }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      const votes = await Models.VoteGauge.find({
        pluginAddress: gaugePluginAddress,
        network,
        epochId,
        resetVoteTransactionHash: null,
      }).lean()

      if (votes.length === 0) {
        logger.warn('No votes found for epoch', llo({ prepareId, epochId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      const memberVotingPower: Record<string, bigint> = {}
      let totalVotingPower = 0n

      for (const vote of votes) {
        const memberAddress = getAddress(vote.memberAddress)
        const votingPower = BigInt(vote.votingPower || '0')

        if (!memberVotingPower[memberAddress]) {
          memberVotingPower[memberAddress] = 0n
        }
        memberVotingPower[memberAddress] += votingPower
        totalVotingPower += votingPower
      }

      if (totalVotingPower === 0n) {
        logger.warn('Total voting power is zero', llo({ prepareId, epochId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      const totalAmountBigInt = BigInt(totalAmount)
      const rewards: Array<{ address: string; amount: string }> = []

      for (const [memberAddress, votingPower] of Object.entries(memberVotingPower)) {
        const amount = (votingPower * totalAmountBigInt) / totalVotingPower
        if (amount > 0n) {
          rewards.push({
            address: memberAddress,
            amount: amount.toString(),
          })
        }
      }

      if (rewards.length === 0) {
        logger.warn('No rewards calculated', llo({ prepareId, epochId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      const governance = MemberGovernanceFactory.create({
        address: capitalDistributorAddress,
        network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }) as CapitalDistributorGovernance

      await governance.uploadMembersList({
        campaignId,
        pluginAddress: capitalDistributorAddress,
        network,
        rewards,
      })

      await CapitalDistributorGateway.generateMerkleData({
        campaignId,
        pluginAddress: capitalDistributorAddress,
        network,
      })

      logger.info('Generated merkle data', llo({ prepareId, campaignId }))

      await campaignPrepare.update({
        status: CampaignPrepareStatus.completed,
        totalMembers: rewards.length,
        epochId,
        campaignId,
      })

      logger.info(
        'Campaign preparation completed',
        llo({ prepareId, campaignId, timeTaken: `${Date.now() - startTime}ms` }),
      )
    } catch (error) {
      logger.error('Error preparing campaign from gauge', llo({ prepareId, error }))

      const campaignPrepare = await Models.CampaignPrepare.findByPrepareId(prepareId)
      if (campaignPrepare) {
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
      }
    }
  },

  generateMerkleData: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const startTime = Date.now()
    logger.info('Generating merkle data', llo({ params }))
    const { campaignId, pluginAddress, network } = params
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    if (!plugin || plugin.interfaceType !== IPluginInterfaceType.capitalDistributor) {
      logger.warn('Plugin not found or invalid interface type', llo({ params }))
      return
    }

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    const response = await governance.generateMerkleData({ campaignId })

    if (response?.success && response?.merkleRoot) {
      const id = Models.CampaignMerkleRoot.getEntityId({ pluginAddress, network, campaignId })

      await Models.CampaignMerkleRoot.findOneAndUpdate(
        { id },
        {
          $set: {
            id,
            pluginAddress,
            network,
            campaignId,
            merkleRoot: response.merkleRoot,
            totalMembers: response.totalMembers || 0,
          },
        },
        { upsert: true, new: true },
      )
      logger.info('Merkle data Generation completed', llo({ params, timeTaken: `${Date.now() - startTime}ms` }))
    }
  },
}

export { CapitalDistributorGateway }
