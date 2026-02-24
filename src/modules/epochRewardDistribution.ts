import { Models } from '@dbModels'
import { type AdjustedRewardParams, type HexAddress, type NetworksEnum } from '@types'

const EpochRewardDistribution = {
  getAdjustedRewards: async (params: AdjustedRewardParams): Promise<Array<{ address: string; amount: string }>> => {
    const { epochId, votingPeriod, capitalDistributorAddress, network, currentRewards, gaugeVoterPlugin } = params

    const windowError = EpochRewardDistribution.validateEpochWindow(epochId, votingPeriod)
    if (windowError) throw new Error(windowError)

    const existing = await Models.EpochReward.findByEpoch(gaugeVoterPlugin, capitalDistributorAddress, network, epochId)
    if (existing) throw new Error(`Epoch ${epochId} rewards already published`)

    const campaignIds = await Models.EpochReward.getActiveCampaignIds(
      gaugeVoterPlugin,
      capitalDistributorAddress,
      network,
    )

    const hasOpen = await Models.Campaign.hasOpenCampaigns(capitalDistributorAddress, network, campaignIds)
    if (hasOpen) {
      throw new Error('Previous campaigns must be ended before publishing new epoch rewards')
    }

    const [pastCumulative, claimed] = await Promise.all([
      Models.EpochReward.getCumulativeRewardsMap(gaugeVoterPlugin, capitalDistributorAddress, network),
      EpochRewardDistribution.getClaimedMap(campaignIds, capitalDistributorAddress, network),
    ])

    const cumulative = EpochRewardDistribution.toMap(pastCumulative)
    for (const r of currentRewards) {
      cumulative[r.address] = (cumulative[r.address] || 0n) + BigInt(r.amount)
    }

    return Object.entries(cumulative)
      .map(([address, total]) => ({ address, amount: total - (claimed[address] || 0n) }))
      .filter(r => r.amount > 0n)
      .map(r => ({ address: r.address, amount: r.amount.toString() }))
  },

  validateEpochWindow: (
    epochId: number,
    votingPeriod: { voteEnd: number; epochStart: number; epochDuration: number },
  ): string | null => {
    const SNAPSHOT_BUFFER = 300
    const now = Math.floor(Date.now() / 1000)
    const backendSnapshotTs = votingPeriod.voteEnd + SNAPSHOT_BUFFER
    const nextEpochStart = votingPeriod.epochStart + votingPeriod.epochDuration

    if (now < backendSnapshotTs) {
      return `Voting window has not closed. Try again in ${backendSnapshotTs - now}s`
    }
    if (now >= nextEpochStart) {
      return `Epoch ${epochId} publish window has passed`
    }
    return null
  },

  getClaimedMap: async (
    campaignIds: string[],
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<Record<string, bigint>> => {
    if (campaignIds.length === 0) return {}

    const results = await Models.CampaignReward.aggregate([
      { $match: { campaignId: { $in: campaignIds }, network, pluginAddress } },
      { $group: { _id: '$userAddress', totalClaimed: { $sum: { $toDecimal: '$totalClaimed' } } } },
      { $project: { _id: 0, address: '$_id', totalClaimed: 1 } },
    ])

    return EpochRewardDistribution.toMap(results, 'totalClaimed')
  },

  toMap: (results: Array<{ address: string; [key: string]: any }>, field = 'total'): Record<string, bigint> => {
    const map: Record<string, bigint> = {}
    for (const r of results) {
      map[r.address] = BigInt(r[field]?.toString() || '0')
    }
    return map
  },

  reconcileDraftCampaignId: async (
    capitalDistributorAddress: HexAddress,
    network: NetworksEnum,
    draftCampaignId: string,
    realCampaignId: string,
    tOpts?: any,
  ) => {
    const epochReward = await Models.EpochReward.findByCampaignId(
      capitalDistributorAddress,
      network,
      draftCampaignId,
      tOpts,
    )
    if (!epochReward) return

    await epochReward.update(
      {
        campaignId: realCampaignId,
      },
      tOpts,
    )
  },

  saveEpochReward: async (params: {
    gaugeVoterPlugin: HexAddress
    capitalDistributorAddress: HexAddress
    network: NetworksEnum
    epochId: number
    campaignId: string
    rewards: Array<{ address: string; amount: string }>
  }) => {
    return Models.EpochReward.create({
      pluginAddress: params.gaugeVoterPlugin,
      capitalDistributorAddress: params.capitalDistributorAddress,
      network: params.network,
      epochId: params.epochId,
      rewardTotalAmount: params.rewards.reduce((sum, r) => (BigInt(sum) + BigInt(r.amount)).toString(), '0'),
      campaignId: params.campaignId,
      rewards: params.rewards,
    })
  },
}

export default EpochRewardDistribution
