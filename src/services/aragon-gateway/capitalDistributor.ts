import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import {
  CampaignPrepareProgress,
  CampaignPrepareStatus,
  type HexAddress,
  IPluginInterfaceType,
  type IPrepareCampaignFromGauge,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'CapitalDistributorGateway' })

type RewardEntry = { address: string; amount: string }

const buildRewardsFromGaugeVotes = async (params: {
  gaugePluginAddress: HexAddress
  network: NetworksEnum
  epochId: string
  totalAmount: string
}): Promise<{ rewards: RewardEntry[]; error?: string }> => {
  const { gaugePluginAddress, network, epochId, totalAmount } = params

  const votes = await Models.VoteGauge.find({
    pluginAddress: gaugePluginAddress,
    network,
    epochId,
    resetVoteTransactionHash: null,
  }).lean()

  if (votes.length === 0) {
    return { rewards: [], error: 'No votes found for epoch' }
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
    return { rewards: [], error: 'Total voting power is zero' }
  }

  const totalAmountBigInt = BigInt(totalAmount)
  const rewards: RewardEntry[] = []

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
    return { rewards: [], error: 'No rewards calculated' }
  }

  return { rewards }
}

const CapitalDistributorGateway = {
  prepareCampaignFromGauge: async (params: IPrepareCampaignFromGauge): Promise<void> => {
    const startTime = Date.now()
    const { prepareId } = params

    const campaignPrepare = await Models.CampaignPrepare.findByPrepareId(prepareId)
    if (!campaignPrepare) {
      logger.error('CampaignPrepare not found', llo({ prepareId }))
      return
    }

    const { daoAddress, network, capitalDistributorAddress, gaugePluginAddress, tokenAddress, totalAmount } =
      campaignPrepare

    try {
      await campaignPrepare.update({
        status: CampaignPrepareStatus.processing,
        progress: CampaignPrepareProgress.fetchingEpoch,
      })

      let epochId = campaignPrepare.epochId
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

      await campaignPrepare.update({ progress: CampaignPrepareProgress.validatingBalance })

      const [campaignId, daoTokenBalance] = await Promise.all([
        Web3Helper.getNumCampaigns(capitalDistributorAddress, network),
        Web3Helper.getTokenBalance(daoAddress, tokenAddress, network),
      ])

      if (BigInt(daoTokenBalance) < BigInt(totalAmount)) {
        logger.warn('Insufficient token balance', llo({ prepareId, daoTokenBalance, totalAmount }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      await campaignPrepare.update({ progress: CampaignPrepareProgress.buildingRewards })

      const { rewards, error } = await buildRewardsFromGaugeVotes({
        gaugePluginAddress,
        network,
        epochId,
        totalAmount,
      })

      if (error) {
        logger.warn(error, llo({ prepareId, epochId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      await campaignPrepare.update({ progress: CampaignPrepareProgress.uploadingMembers })

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

      await campaignPrepare.update({ progress: CampaignPrepareProgress.generatingMerkle })

      const merkleRoot = await CapitalDistributorGateway.generateMerkleData({
        campaignId,
        pluginAddress: capitalDistributorAddress,
        network,
      })

      if (!merkleRoot) {
        logger.warn('Failed to generate merkle root', llo({ prepareId, campaignId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      await campaignPrepare.update({
        status: CampaignPrepareStatus.completed,
        progress: CampaignPrepareProgress.done,
        totalMembers: rewards.length,
        epochId,
        merkleRoot,
      })

      logger.info(
        'Campaign preparation completed',
        llo({ prepareId, campaignId, timeTaken: `${Date.now() - startTime}ms` }),
      )
    } catch (error) {
      logger.error('Error preparing campaign from gauge', llo({ prepareId, error }))
      await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
    }
  },

  generateMerkleData: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<string | null> => {
    const startTime = Date.now()
    logger.info('Generating merkle data', llo({ params }))
    const { campaignId, pluginAddress, network } = params

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    if (!plugin || plugin.interfaceType !== IPluginInterfaceType.capitalDistributor) {
      logger.warn('Plugin not found or invalid interface type', llo({ params }))
      return null
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
      logger.info('Merkle data generation completed', llo({ params, timeTaken: `${Date.now() - startTime}ms` }))
      return response.merkleRoot
    }

    return null
  },
}

export { CapitalDistributorGateway }
