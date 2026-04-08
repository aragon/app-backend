import GovernanceRewards from '@modules/governanceRewards'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import sinon from 'sinon'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { type GaugesActivityResult, VoteOption, runGaugesActivity } from '../setups/gaugesActivity'
import { type GaugesDaoDeployment, setupGaugesDao } from '../setups/gaugesDaoSetup'
import { computeExpectedRewards } from '../setups/rewardsExpectation'

const NETWORK = NetworksEnum.ethereumMainnet
const FORK_BLOCK = 24541643

describe.only('Governance Rewards — edge cases', function () {
  this.timeout(600_000)
  this.slow(0)

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario A: snapshot timing
  //
  // Initial: 5 stakers (1k–5k CTX). staker0/1 self-delegate. staker2/3 → staker0.
  // staker4 has NO delegation yet.
  //
  // Proposal 1: both delegates (staker0, staker1) vote.
  //   delegationsAfter:
  //     - staker4 → staker0  (LATE — invisible to p1's snapshot, so staker4 NOT eligible for p1)
  //     - staker3 → staker1  (SWITCH — staker3 was on staker0 for p1, will be on staker1 for p2)
  //
  // Proposal 2: only staker0 votes.
  //   At p2's snapshot:
  //     staker0 (self) → 0 voted → eligible
  //     staker1 (self) → 1 didn't vote → NOT eligible
  //     staker2 (→ 0)  → 0 voted → eligible
  //     staker3 (→ 1, switched)  → 1 didn't vote → NOT eligible
  //     staker4 (→ 0, late)  → 0 voted → eligible
  //
  // Proposal 3: nobody votes → contributes nothing.
  //
  // Final eligibility:
  //   staker0:  p1 + p2  (always self-delegated, voted on both)
  //   staker1:  p1 only  (didn't vote on p2)
  //   staker2:  p1 + p2  (delegate0 voted on both)
  //   staker3:  p1 only  (was on 0 for p1, switched to 1 who didn't vote on p2)
  //   staker4:  p2 only  (no delegation at p1, late delegation to 0 in time for p2)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('snapshot timing — late delegation, delegate switch, no-vote proposal', () => {
    let dep: GaugesDaoDeployment
    let activity: GaugesActivityResult

    before(async () => {
      await resetFork(FORK_BLOCK)
      const startBlock = await getAnvilProvider().getBlockNumber()

      dep = await setupGaugesDao()

      activity = await runGaugesActivity(dep, {
        stakers: [
          { amount: ethers.parseEther('1000') },
          { amount: ethers.parseEther('2000') },
          { amount: ethers.parseEther('3000') },
          { amount: ethers.parseEther('4000') },
          { amount: ethers.parseEther('5000') },
        ],
        delegations: [
          { from: 0, to: 'self' },
          { from: 1, to: 'self' },
          { from: 2, to: 0 },
          { from: 3, to: 0 },
          // staker4 intentionally omitted — they have no delegation at p1's snapshot.
        ],
        proposals: [
          {
            // p1: both delegates vote.
            votes: [
              { from: 0, choice: VoteOption.Yes },
              { from: 1, choice: VoteOption.Yes },
            ],
            delegationsAfter: [
              { from: 4, to: 0 }, // late: staker4 → staker0 (NOT eligible for p1)
              { from: 3, to: 1 }, // switch: staker3 → staker1 (was on 0 at p1, on 1 from p2 onwards)
            ],
          },
          {
            // p2: only staker0 votes.
            votes: [{ from: 0, choice: VoteOption.Yes }],
          },
          {
            // p3: nobody votes.
            votes: [],
          },
        ],
      })

      const latestBlock = await getAnvilProvider().getBlockNumber()
      await startServices(startBlock)
      await waitForIndexerCatchup(latestBlock, 180_000)
    })

    after(() => stopServices())

    it('reward calculation matches expected exactly', async () => {
      const totalAmount = ethers.parseEther('1000')
      const lookbackDate = '2024-01-01T00:00:00.000Z'

      const calc = new GovernanceRewards({
        pluginAddress: dep.tokenVoting as HexAddress,
        network: NETWORK,
        totalAmount,
        lookbackDate,
      })
      const actual = await calc.compute()
      if ('error' in actual) throw new Error(`GovernanceRewards.compute returned error: ${actual.error}`)

      const expected = await computeExpectedRewards({
        dep,
        activity,
        network: NETWORK,
        totalAmount,
        lookbackDate,
      })

      console.log('actual rewards:', actual)
      console.log('expected rewards:', expected)

      // Sanity: total payout = totalAmount.
      const sum = actual.reduce((s, r) => s + r.amount, 0n)
      expect(sum, 'total payout != totalAmount').to.equal(totalAmount)

      // Exact match.
      expect(actual.length, 'recipient count mismatch').to.equal(expected.length)
      for (let i = 0; i < actual.length; i++) {
        expect(actual[i].address, `address mismatch at index ${i}`).to.equal(expected[i].address)
        expect(actual[i].amount, `amount mismatch at index ${i} (${actual[i].address})`).to.equal(expected[i].amount)
      }

      // Spot check: every recipient should be one of stakers 0..4 (no extras).
      const stakerAddresses = new Set(activity.stakers.map(s => s.wallet.address))
      for (const r of actual) {
        expect(stakerAddresses.has(r.address), `unknown recipient ${r.address}`).to.be.true
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario B: no proposals in window → fallback to current-VP distribution
  //
  // 3 stakers, all delegated. No proposals at all. The calc takes the
  // `proposals.length === 0` branch and distributes based on current VP across
  // every staker who's currently delegated to anyone.
  //
  // We freeze Date.now() so the calc and the expected agree on the "current"
  // timestamp passed to votingPowerAt — otherwise a sub-second drift between the
  // two calls could yield slightly different VPs.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('fallback — no proposals in window distributes by current VP', () => {
    let dep: GaugesDaoDeployment
    let activity: GaugesActivityResult

    before(async () => {
      await resetFork(FORK_BLOCK)
      const startBlock = await getAnvilProvider().getBlockNumber()

      dep = await setupGaugesDao()

      activity = await runGaugesActivity(dep, {
        stakers: [
          { amount: ethers.parseEther('1000') },
          { amount: ethers.parseEther('2000') },
          { amount: ethers.parseEther('3000') },
        ],
        delegations: [
          { from: 0, to: 'self' },
          { from: 1, to: 0 },
          { from: 2, to: 0 },
        ],
        proposals: [], // explicit: no proposals → fallback path
      })

      const latestBlock = await getAnvilProvider().getBlockNumber()
      await startServices(startBlock)
      await waitForIndexerCatchup(latestBlock, 180_000)
    })

    after(() => stopServices())

    it('falls back to current-VP pro-rata and matches expected exactly', async () => {
      const totalAmount = ethers.parseEther('1000')
      const lookbackDate = '2024-01-01T00:00:00.000Z'

      // Freeze the wall clock so calc and expected use the exact same `now` for
      // their `votingPowerAt(tokenId, now)` calls. Without this, the two integer
      // seconds can differ across the two calls and produce slightly different VPs.
      const fixedNowMs = Date.now()
      const stub = sinon.stub(Date, 'now').returns(fixedNowMs)
      try {
        const calc = new GovernanceRewards({
          pluginAddress: dep.tokenVoting as HexAddress,
          network: NETWORK,
          totalAmount,
          lookbackDate,
        })
        const actual = await calc.compute()
        if ('error' in actual) throw new Error(`GovernanceRewards.compute returned error: ${actual.error}`)

        const expected = await computeExpectedRewards({
          dep,
          activity,
          network: NETWORK,
          totalAmount,
          lookbackDate,
        })

        console.log('actual rewards:', actual)
        console.log('expected rewards:', expected)

        const sum = actual.reduce((s, r) => s + r.amount, 0n)
        expect(sum, 'total payout != totalAmount').to.equal(totalAmount)

        expect(actual.length, 'recipient count mismatch').to.equal(expected.length)
        for (let i = 0; i < actual.length; i++) {
          expect(actual[i].address, `address mismatch at index ${i}`).to.equal(expected[i].address)
          expect(actual[i].amount, `amount mismatch at index ${i} (${actual[i].address})`).to.equal(expected[i].amount)
        }

        // Every staker is currently delegated, so every staker should appear.
        expect(actual.length).to.equal(activity.stakers.length)
      } finally {
        stub.restore()
      }
    })
  })
})
