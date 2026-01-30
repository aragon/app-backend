import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import {
  CampaignPrepareProgress,
  CampaignPrepareStatus,
  type HexAddress,
  IPluginInterfaceType,
  type IPrepareCampaignFromGauge,
  type NetworksEnum,
} from '@types'
import { getAddress, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'CapitalDistributorGateway' })

type RewardEntry = { address: string; amount: string }

const buildRewardsFromGaugeVotes = async (params: {
  gaugePluginAddress: HexAddress
  network: NetworksEnum
  totalAmount: string
}): Promise<{ rewards: RewardEntry[]; totalVotingPower: bigint; error?: string }> => {
  const { gaugePluginAddress, network, totalAmount } = params

  const plugin = await Models.Plugin.findByAddress(gaugePluginAddress, network)
  if (!plugin) {
    return { rewards: [], totalVotingPower: 0n, error: 'Gauge plugin not found' }
  }

  const crawler = new BlockchainLogCrawler({
    skipLogProcessing: true,
    logService: null,
    fromBlock: plugin.blockNumber,
    network,
    address: gaugePluginAddress,
    stopOnError: false,
    onError: async (error: any) => logger.error('Error fetching gauge events', llo({ error })),
    events: [
      {
        event: 'Voted',
        topic: new Interface(GaugeVoter.abi).getEvent('Voted')?.topicHash!,
        config: [{ abi: GaugeVoter.abi, handler: async () => {} }],
      },
      {
        event: 'Reset',
        topic: new Interface(GaugeVoter.abi).getEvent('Reset')?.topicHash!,
        config: [{ abi: GaugeVoter.abi, handler: async () => {} }],
      },
    ],
  })

  const logs = await crawler.crawl()

  if (!logs || logs.length === 0) {
    return { rewards: [], totalVotingPower: 0n, error: 'No votes found' }
  }

  // Tally voting power per voter from on-chain events
  const memberVotingPower: Record<string, bigint> = {}

  for (const log of logs) {
    const voter = getAddress(log.event.args.voter)
    if (!memberVotingPower[voter]) {
      memberVotingPower[voter] = 0n
    }
    if (log.event.name === 'Voted') {
      memberVotingPower[voter] += BigInt(log.event.args.votingPowerCastForGauge)
    } else if (log.event.name === 'Reset') {
      memberVotingPower[voter] -= BigInt(log.event.args.votingPowerRemovedFromGauge)
    }
  }

  let totalVotingPower = 0n
  for (const vp of Object.values(memberVotingPower)) {
    if (vp > 0n) {
      totalVotingPower += vp
    }
  }

  if (totalVotingPower === 0n) {
    return { rewards: [], totalVotingPower: 0n, error: 'Total voting power is zero' }
  }

  const totalAmountBigInt = BigInt(totalAmount)
  const rewards: RewardEntry[] = []
  let distributedTotal = 0n
  let topVoterAddress: string | null = null
  let topVotingPower = 0n

  for (const [memberAddress, votingPower] of Object.entries(memberVotingPower)) {
    if (votingPower <= 0n) continue
    const amount = (votingPower * totalAmountBigInt) / totalVotingPower
    if (amount > 0n) {
      rewards.push({
        address: memberAddress,
        amount: amount.toString(),
      })
      distributedTotal += amount
    }

    if (topVoterAddress === null || votingPower > topVotingPower) {
      topVotingPower = votingPower
      topVoterAddress = memberAddress
    }
  }

  const remainder = totalAmountBigInt - distributedTotal
  if (remainder > 0n && topVoterAddress) {
    const topVoterReward = rewards.find(r => r.address === topVoterAddress)
    if (topVoterReward) {
      topVoterReward.amount = (BigInt(topVoterReward.amount) + remainder).toString()
    }
  }

  if (rewards.length === 0) {
    return { rewards: [], totalVotingPower, error: 'No rewards calculated' }
  }

  return { rewards, totalVotingPower }
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
        progress: CampaignPrepareProgress.validatingBalance,
      })

      const [campaignId, daoTokenBalance] = await Promise.all([
        Web3Helper.getNumCampaigns(capitalDistributorAddress, network),
        Web3Helper.getTokenBalance(daoAddress, tokenAddress, network),
      ])

      if (BigInt(daoTokenBalance) < BigInt(totalAmount)) {
        logger.warn('Insufficient token balance', llo({ prepareId, daoTokenBalance, totalAmount }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      await campaignPrepare.update({ progress: CampaignPrepareProgress.fetchingOnChainVotes })

      const { rewards, totalVotingPower, error } = await buildRewardsFromGaugeVotes({
        gaugePluginAddress,
        network,
        totalAmount,
      })

      if (error) {
        logger.warn(error, llo({ prepareId }))
        await campaignPrepare.update({ status: CampaignPrepareStatus.failed })
        return
      }

      logger.info(
        'Votes aggregated',
        llo({ prepareId, totalVotingPower: totalVotingPower.toString(), rewardCount: rewards.length }),
      )

      await campaignPrepare.update({ progress: CampaignPrepareProgress.buildingRewards })

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
