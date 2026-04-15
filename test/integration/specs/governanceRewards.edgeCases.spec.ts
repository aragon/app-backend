import GovernanceRewards from '@modules/governanceRewards'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import sinon from 'sinon'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { type GaugesActivityResult, runGaugesActivity, VoteOption } from '../setups/gaugesActivity'
import { type GaugesDaoDeployment, setupGaugesDao } from '../setups/gaugesDaoSetup'
import { computeExpectedRewards } from '../setups/rewardsExpectation'

const NETWORK = NetworksEnum.ethereumMainnet
const FORK_BLOCK = 24541643

describe.skip('Governance Rewards — edge cases', function () {
  this.timeout(600_000)
  this.slow(0)

  // 5 stakers (1k–5k CTX). 0/1 self, 2/3 → 0, 4 not yet delegated.
  // p1 votes [0,1], delegationsAfter [4→0 (late), 3→1 (switch)].
  // p2 votes [0]. p3 no votes.
  // Eligibility: 0 → p1+p2, 1 → p1 only, 2 → p1+p2, 3 → p1 only, 4 → p2 only.
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
        ],
        proposals: [
          {
            votes: [
              { from: 0, choice: VoteOption.Yes },
              { from: 1, choice: VoteOption.Yes },
            ],
            delegationsAfter: [
              { from: 4, to: 0 },
              { from: 3, to: 1 },
            ],
          },
          {
            votes: [{ from: 0, choice: VoteOption.Yes }],
          },
          {
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

      const sum = actual.reduce((s, r) => s + r.amount, 0n)
      expect(sum, 'total payout != totalAmount').to.equal(totalAmount)

      expect(actual.length, 'recipient count mismatch').to.equal(expected.length)
      for (let i = 0; i < actual.length; i++) {
        expect(actual[i].address, `address mismatch at index ${i}`).to.equal(expected[i].address)
        expect(actual[i].amount, `amount mismatch at index ${i} (${actual[i].address})`).to.equal(expected[i].amount)
      }

      const stakerAddresses = new Set(activity.stakers.map(s => s.wallet.address))
      for (const r of actual) {
        expect(stakerAddresses.has(r.address), `unknown recipient ${r.address}`).to.be.true
      }
    })
  })

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
        proposals: [],
      })

      const latestBlock = await getAnvilProvider().getBlockNumber()
      await startServices(startBlock)
      await waitForIndexerCatchup(latestBlock, 180_000)
    })

    after(() => stopServices())

    it('falls back to current-VP pro-rata and matches expected exactly', async () => {
      const totalAmount = ethers.parseEther('1000')
      const lookbackDate = '2024-01-01T00:00:00.000Z'

      // Freeze the wall clock so calc and expected pass identical `now` to votingPowerAt.
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

        const sum = actual.reduce((s, r) => s + r.amount, 0n)
        expect(sum, 'total payout != totalAmount').to.equal(totalAmount)

        expect(actual.length, 'recipient count mismatch').to.equal(expected.length)
        for (let i = 0; i < actual.length; i++) {
          expect(actual[i].address, `address mismatch at index ${i}`).to.equal(expected[i].address)
          expect(actual[i].amount, `amount mismatch at index ${i} (${actual[i].address})`).to.equal(expected[i].amount)
        }

        expect(actual.length).to.equal(activity.stakers.length)
      } finally {
        stub.restore()
      }
    })
  })
})
