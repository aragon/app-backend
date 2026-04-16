import config from '@config'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import logger from '@logger'
import { type HexAddress, NetworksEnum, type RewardDistributionParams } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:gaugeRewardDistribution' })

export interface GaugeReward {
  gauge: string
  votingPower: bigint
  rewardAmount: bigint
}

export interface GaugeRewardDistributionResult {
  epoch: number
  pluginAddress: string
  network: string
  totalVotingPower: bigint
  rewardTotalAmount: bigint
  gaugeRewards: GaugeReward[]
}

class GaugeRewardDistribution {
  private readonly pluginAddress: HexAddress
  private readonly network: NetworksEnum
  private readonly epochId: number
  private readonly rewardTotalAmount: bigint

  private clockAddress!: HexAddress
  private votingPeriod!: { epochStart: number; voteEnd: number; epochDuration: number }

  constructor(params: RewardDistributionParams) {
    this.pluginAddress = params.pluginAddress
    this.network = params.network
    this.epochId = params.epochId
    this.rewardTotalAmount = params.rewardTotalAmount
  }

  async init(): Promise<boolean> {
    const clockAddress = await GovernanceVeHelper.getClockAddress(this.pluginAddress, this.network)
    if (!clockAddress) {
      logger.error('Failed to resolve clock address', llo({ pluginAddress: this.pluginAddress }))
      return false
    }
    this.clockAddress = clockAddress

    const votingPeriod = await GaugeHelper.getVotingPeriodEnd(this.clockAddress, this.epochId, this.network)
    if (!votingPeriod) {
      logger.error('Failed to resolve voting period timing', llo({ epochId: this.epochId }))
      return false
    }
    this.votingPeriod = votingPeriod

    return true
  }

  validateEpochWindow(): { errorKey: string; message: string } | null {
    const SNAPSHOT_BUFFER = 300
    const now = Math.floor(Date.now() / 1000)
    const backendSnapshotTs = this.votingPeriod.voteEnd + SNAPSHOT_BUFFER
    const nextEpochStart = this.votingPeriod.epochStart + this.votingPeriod.epochDuration

    if (!config.REWARDS.ALLOW_EARLY_REWARD_GENERATION && now < backendSnapshotTs) {
      return {
        errorKey: 'epochVotingNotClosed',
        message: `Epoch ${this.epochId} voting window has not closed yet. Try again in ${backendSnapshotTs - now}s`,
      }
    }

    if (!config.REWARDS.ALLOW_RETROACTIVE_REWARDS && now >= nextEpochStart) {
      return {
        errorKey: 'epochWindowExpired',
        message: `Epoch ${this.epochId} reward generation window has passed (${now - nextEpochStart}s ago)`,
      }
    }

    return null
  }

  async compute(): Promise<GaugeRewardDistributionResult | { errorKey?: string; error: string } | null> {
    const ready = await this.init()
    if (!ready) return null

    const windowError = this.validateEpochWindow()
    if (windowError) return { errorKey: windowError.errorKey, error: windowError.message }

    const perGaugeVP = await Models.VoteGauge.getPerGaugeVP(this.pluginAddress, this.network, this.votingPeriod.voteEnd)

    if (perGaugeVP.size === 0) {
      return {
        epoch: this.epochId,
        pluginAddress: this.pluginAddress,
        network: this.network,
        totalVotingPower: 0n,
        rewardTotalAmount: this.rewardTotalAmount,
        gaugeRewards: [],
      }
    }

    const totalVP = [...perGaugeVP.values()].reduce((sum, vp) => sum + vp, 0n)

    const gaugeRewards: GaugeReward[] = [...perGaugeVP.entries()].map(([gauge, votingPower]) => ({
      gauge,
      votingPower,
      rewardAmount: totalVP > 0n ? (votingPower * this.rewardTotalAmount) / totalVP : 0n,
    }))

    if (gaugeRewards.length > 0 && totalVP > 0n) {
      const distributed = gaugeRewards.reduce((sum, r) => sum + r.rewardAmount, 0n)
      const dust = this.rewardTotalAmount - distributed
      if (dust > 0n) {
        const largest = gaugeRewards.reduce((max, r) => (r.votingPower > max.votingPower ? r : max))
        largest.rewardAmount += dust
      }
    }

    return {
      epoch: this.epochId,
      pluginAddress: this.pluginAddress,
      network: this.network,
      totalVotingPower: totalVP,
      rewardTotalAmount: this.rewardTotalAmount,
      gaugeRewards,
    }
  }
}

export default GaugeRewardDistribution
