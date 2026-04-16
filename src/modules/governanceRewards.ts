import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { type HexAddress, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:governanceRewards' })

export interface GovernanceRewardsParams {
  pluginAddress: HexAddress
  network: NetworksEnum
  totalAmount: bigint
  lookbackDate: string
}

export interface StakerReward {
  address: string
  amount: bigint
}

class GovernanceRewards {
  private readonly pluginAddress: HexAddress
  private readonly network: NetworksEnum
  private readonly totalAmount: bigint
  private readonly lookbackDate: string

  private ivotesAdapterAddress!: HexAddress
  private escrowAddress!: HexAddress

  constructor(params: GovernanceRewardsParams) {
    this.pluginAddress = params.pluginAddress
    this.network = params.network
    this.totalAmount = params.totalAmount
    this.lookbackDate = params.lookbackDate
  }

  async compute(): Promise<StakerReward[] | { error: string }> {
    // Step 1: Resolve addresses
    const plugin = await Models.Plugin.findByAddress(this.pluginAddress, this.network)
    if (!plugin?.tokenAddress) {
      logger.error('Failed to resolve plugin or token address', llo({ pluginAddress: this.pluginAddress }))
      return { error: 'Failed to resolve plugin token address' }
    }
    this.ivotesAdapterAddress = plugin.tokenAddress

    const escrowAddress = await GovernanceVeHelper.getEscrowAddress(this.ivotesAdapterAddress, this.network)
    if (!escrowAddress) {
      logger.error('Failed to resolve escrow address', llo({ adapterAddress: this.ivotesAdapterAddress }))
      return { error: 'Failed to resolve escrow address' }
    }
    this.escrowAddress = escrowAddress

    // Step 2: Fetch proposals whose voting end falls within the lookback window
    const now = Math.floor(Date.now() / 1000)
    const windowStart = Math.floor(new Date(this.lookbackDate).getTime() / 1000)
    if (!Number.isFinite(windowStart) || windowStart >= now) {
      return { error: 'Invalid or future lookbackDate' }
    }
    const proposals = await Models.Proposal.find({
      pluginAddress: this.pluginAddress,
      network: this.network,
      endDate: { $gte: windowStart, $lte: now },
    })

    // Step 3: No proposals → distribute pro-rata by current voting power to all active delegators
    if (proposals.length === 0) {
      const allDelegations = await this.getAllActiveDelegations()
      if (allDelegations.length === 0) return []

      const vpMap = await this.getTokenVotingPowers(allDelegations, now)
      const stakerWeights = this.aggregateByStaker(allDelegations, vpMap)
      return GovernanceRewards.distribute(stakerWeights, this.totalAmount)
    }

    // Step 4: Per-proposal weight accumulation
    const weights = new Map<string, bigint>()

    for (const proposal of proposals) {
      // 4a: Which delegates voted on this proposal?
      const votes = await Models.Vote.findVotes({
        proposalIndex: proposal.proposalIndex,
        pluginAddress: this.pluginAddress,
        network: this.network,
      })
      const delegatesWhoVoted = [...new Set(votes.map(v => v.memberAddress))]
      if (delegatesWhoVoted.length === 0) continue

      // 4b: Which tokens were delegated to those delegates at proposal creation?
      const snapshotTs = proposal.blockTimestamp
      const delegations = await Models.TokenDelegation.getActiveDelegations(
        this.ivotesAdapterAddress,
        this.network,
        delegatesWhoVoted,
        snapshotTs,
      )
      if (delegations.length === 0) continue

      // 4c: Get per-token voting power at proposal creation snapshot
      const vpMap = await this.getTokenVotingPowers(delegations, snapshotTs)

      // 4d: Credit stakers (delegators) with their token VP
      for (const { delegator, tokenId } of delegations) {
        const vp = vpMap.get(tokenId) ?? 0n
        if (vp > 0n) {
          weights.set(delegator, (weights.get(delegator) ?? 0n) + vp)
        }
      }
    }

    return GovernanceRewards.distribute(weights, this.totalAmount)
  }

  /**
   * Gets all actively delegated tokens (no delegate filter).
   * Used for the no-proposals fallback.
   */
  private async getAllActiveDelegations(): Promise<Array<{ delegator: string; tokenId: string; delegate: string }>> {
    return Models.TokenDelegation.aggregate([
      {
        $match: {
          contractAddress: this.ivotesAdapterAddress,
          network: this.network,
        },
      },
      { $unwind: '$tokenIds' },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: { delegator: '$delegator', tokenId: '$tokenIds' },
          action: { $first: '$action' },
          delegate: { $first: '$delegate' },
        },
      },
      { $match: { action: 'delegate' } },
      {
        $project: {
          _id: 0,
          delegator: '$_id.delegator',
          tokenId: '$_id.tokenId',
          delegate: 1,
        },
      },
    ])
  }

  /**
   * Batch-calls votingPowerAt(tokenId, timestamp) on the escrow for each delegation entry.
   */
  private async getTokenVotingPowers(
    delegations: Array<{ tokenId: string }>,
    timestamp: number,
  ): Promise<Map<string, bigint>> {
    const batchParams = delegations.map(d => ({
      escrowAddress: this.escrowAddress,
      tokenId: d.tokenId,
      ts: timestamp,
    }))

    const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, this.network)

    const vpMap = new Map<string, bigint>()
    for (const { tokenId, votingPower } of results) {
      if (votingPower > 0n) vpMap.set(tokenId, votingPower)
    }
    return vpMap
  }

  /**
   * Aggregates per-token VP into per-staker weights.
   */
  private aggregateByStaker(
    delegations: Array<{ delegator: string; tokenId: string }>,
    vpMap: Map<string, bigint>,
  ): Map<string, bigint> {
    const weights = new Map<string, bigint>()
    for (const { delegator, tokenId } of delegations) {
      const vp = vpMap.get(tokenId) ?? 0n
      if (vp > 0n) {
        weights.set(delegator, (weights.get(delegator) ?? 0n) + vp)
      }
    }
    return weights
  }

  /**
   * Pro-rata distribution with dust assigned to the largest recipient.
   */
  static distribute(weights: Map<string, bigint>, totalAmount: bigint): StakerReward[] {
    const totalWeight = [...weights.values()].reduce((sum, w) => sum + w, 0n)
    if (totalWeight === 0n) return []

    const rewards: StakerReward[] = [...weights.entries()].map(([address, weight]) => ({
      address,
      amount: (weight * totalAmount) / totalWeight,
    }))

    rewards.sort((a, b) =>
      b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : BigInt(a.address) < BigInt(b.address) ? -1 : 1,
    )

    const distributed = rewards.reduce((sum, r) => sum + r.amount, 0n)
    const dust = totalAmount - distributed
    if (dust > 0n) {
      rewards[0].amount += dust
    }

    return rewards
  }
}

export default GovernanceRewards
