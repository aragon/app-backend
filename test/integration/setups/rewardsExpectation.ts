import { Models } from '@dbModels'
import type { NetworksEnum } from '@types'
import { ethers } from 'ethers'
import { getAnvilProvider } from '../helpers/constants'
import type { GaugesActivityResult, ResolvedDelegation } from './gaugesActivity'
import type { GaugesDaoDeployment } from './gaugesDaoSetup'

/**
 * Expected reward calculator — mirrors `src/modules/governanceRewards.ts` rules but sources
 * delegations from the fixture's chronological event log (the independent ground truth)
 * instead of `Models.TokenDelegation`. VP, proposals, and votes still come from the same
 * Mongo + escrow contract, so a mismatch points at a real calc bug, not re-implementation drift.
 *
 * Supports both calc paths: per-proposal weights and the no-proposals fallback.
 */

const ESCROW_ABI = ['function votingPowerAt(uint256 _tokenId, uint256 _t) view returns (uint256)'] as const

export interface ExpectedReward {
  address: string
  amount: bigint
}

/** Latest delegation event for `tokenId` with `blockTimestamp <= ts`, or null. */
function delegateOfTokenAt(events: ResolvedDelegation[], tokenId: bigint, ts: number): string | null {
  let latest: ResolvedDelegation | null = null
  for (const e of events) {
    if (e.tokenId !== tokenId) continue
    if (e.blockTimestamp > ts) continue
    if (!latest || e.blockNumber > latest.blockNumber) latest = e
  }
  return latest?.to ?? null
}

/** Latest delegation event for `tokenId`, no time filter. Mirrors `getAllActiveDelegations`. */
function delegateOfTokenLatest(events: ResolvedDelegation[], tokenId: bigint): string | null {
  let latest: ResolvedDelegation | null = null
  for (const e of events) {
    if (e.tokenId !== tokenId) continue
    if (!latest || e.blockNumber > latest.blockNumber) latest = e
  }
  return latest?.to ?? null
}

export async function computeExpectedRewards(args: {
  dep: GaugesDaoDeployment
  activity: GaugesActivityResult
  network: NetworksEnum
  totalAmount: bigint
  lookbackDate: string
}): Promise<ExpectedReward[]> {
  const { dep, activity, network, totalAmount, lookbackDate } = args
  const provider = getAnvilProvider()
  const escrow = new ethers.Contract(dep.votingEscrow, ESCROW_ABI, provider)

  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(new Date(lookbackDate).getTime() / 1000)

  const proposals = await Models.Proposal.find({
    pluginAddress: dep.tokenVoting,
    network,
    endDate: { $gte: windowStart, $lte: now },
  })

  // Fallback: no proposals in window → distribute by current VP across all delegators.
  if (proposals.length === 0) {
    const weights = new Map<string, bigint>()
    for (const staker of activity.stakers) {
      const delegate = delegateOfTokenLatest(activity.delegations, staker.tokenId)
      if (!delegate) continue
      const vp: bigint = await escrow.votingPowerAt(staker.tokenId.toString(), now)
      if (vp > 0n) {
        weights.set(staker.wallet.address, (weights.get(staker.wallet.address) ?? 0n) + vp)
      }
    }
    return distribute(weights, totalAmount)
  }

  const weights = new Map<string, bigint>()
  for (const proposal of proposals) {
    const votes = await Models.Vote.findVotes({
      proposalIndex: proposal.proposalIndex,
      pluginAddress: dep.tokenVoting,
      network,
    })
    const delegatesWhoVoted = new Set(votes.map(v => v.memberAddress))
    if (delegatesWhoVoted.size === 0) continue

    // Resolve each token's delegation AT the snapshot — late delegations
    // (blockTimestamp > snapshotTs) are filtered out by delegateOfTokenAt.
    const snapshotTs = proposal.blockTimestamp
    for (const staker of activity.stakers) {
      const delegate = delegateOfTokenAt(activity.delegations, staker.tokenId, snapshotTs)
      if (!delegate) continue
      if (!delegatesWhoVoted.has(delegate)) continue
      const vp: bigint = await escrow.votingPowerAt(staker.tokenId.toString(), snapshotTs)
      if (vp > 0n) {
        weights.set(staker.wallet.address, (weights.get(staker.wallet.address) ?? 0n) + vp)
      }
    }
  }

  return distribute(weights, totalAmount)
}

/** Byte-for-byte mirror of `GovernanceRewards.distribute`. */
function distribute(weights: Map<string, bigint>, totalAmount: bigint): ExpectedReward[] {
  const totalWeight = [...weights.values()].reduce((sum, w) => sum + w, 0n)
  if (totalWeight === 0n) return []

  const rewards: ExpectedReward[] = [...weights.entries()].map(([address, weight]) => ({
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
