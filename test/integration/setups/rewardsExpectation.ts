import { Models } from '@dbModels'
import type { NetworksEnum } from '@types'
import { ethers } from 'ethers'
import { getAnvilProvider } from '../helpers/constants'
import type { GaugesActivityResult, ResolvedDelegation } from './gaugesActivity'
import type { GaugesDaoDeployment } from './gaugesDaoSetup'

/**
 * Expected reward calculator — mirrors `src/modules/governanceRewards.ts` rules
 * but sources delegations from the fixture's chronological event log (the independent
 * ground truth) instead of `Models.TokenDelegation`. This way:
 *
 *   - VP per token comes from the same source as the calc (`votingPowerAt` on the
 *     escrow), so VP values are identical.
 *   - Proposal blockTimestamps come from the same source (`Models.Proposal`).
 *   - "Which delegates voted" comes from the same source (`Models.Vote`).
 *   - The delegation state at any historical timestamp is computed from the fixture's
 *     `activity.delegations` event list — bypassing any potential bugs in the indexer's
 *     `getActiveDelegations` aggregation.
 *   - The pro-rata + dust-to-largest distribution mirrors the calc byte-for-byte.
 *
 * Supports both code paths in `GovernanceRewards.compute()`:
 *   1. Main path: at least one proposal in the lookback window → per-proposal weights.
 *   2. Fallback: no proposals in window → distribute by current VP across all delegators.
 */

const ESCROW_ABI = ['function votingPowerAt(uint256 _tokenId, uint256 _t) view returns (uint256)'] as const

export interface ExpectedReward {
  address: string
  amount: bigint
}

/**
 * Find the delegation event for `tokenId` whose `blockTimestamp <= ts`, picking the
 * latest by (blockNumber, then array order). Returns the delegate address or null
 * if the token had no delegation in place at that time.
 */
function delegateOfTokenAt(events: ResolvedDelegation[], tokenId: bigint, ts: number): string | null {
  let latest: ResolvedDelegation | null = null
  for (const e of events) {
    if (e.tokenId !== tokenId) continue
    if (e.blockTimestamp > ts) continue
    if (!latest || e.blockNumber > latest.blockNumber) latest = e
  }
  return latest?.to ?? null
}

/** Latest delegation event for `tokenId` regardless of timestamp. Mirrors the fallback path's
 *  `getAllActiveDelegations` (which has no time filter). */
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

  // 1. Window — same math as the calc.
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(new Date(lookbackDate).getTime() / 1000)

  // 2. Proposals in window. Read from DB to get the same blockTimestamp the calc uses.
  const proposals = await Models.Proposal.find({
    pluginAddress: dep.tokenVoting,
    network,
    endDate: { $gte: windowStart, $lte: now },
  })

  // ── Fallback path: no proposals → distribute by current VP across all delegators ──
  if (proposals.length === 0) {
    const weights = new Map<string, bigint>()
    for (const staker of activity.stakers) {
      const delegate = delegateOfTokenLatest(activity.delegations, staker.tokenId)
      if (!delegate) continue // not currently delegated → not in `getAllActiveDelegations`
      const vp: bigint = await escrow.votingPowerAt(staker.tokenId.toString(), now)
      if (vp > 0n) {
        weights.set(staker.wallet.address, (weights.get(staker.wallet.address) ?? 0n) + vp)
      }
    }
    return distribute(weights, totalAmount)
  }

  // ── Main path: per-proposal weight accumulation ──
  const weights = new Map<string, bigint>()
  for (const proposal of proposals) {
    // Which delegates voted on this proposal? (Same DB read as calc.)
    const votes = await Models.Vote.findVotes({
      proposalIndex: proposal.proposalIndex,
      pluginAddress: dep.tokenVoting,
      network,
    })
    const delegatesWhoVoted = new Set(votes.map(v => v.memberAddress))
    if (delegatesWhoVoted.size === 0) continue

    // For each token, look up its delegation state AT the proposal's snapshot.
    // This is the line that exercises late-delegation / delegate-switch correctness:
    // a delegation event with blockTimestamp > snapshotTs is invisible here.
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

/** Mirrors `GovernanceRewards.distribute` exactly — same sort key, same dust assignment. */
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
