import { Models } from '@dbModels'
import GaugeRewardDistribution from '@modules/gaugeRewardDistribution'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { type GaugeVotingResult, runGaugeVotingActivity, setupGaugesDaoLight } from '../setups/gaugeVotingActivity'
import type { GaugesDaoDeployment } from '../types/gaugesFixture'

const NETWORK = NetworksEnum.ethereumMainnet

const GAUGE_A = ethers.Wallet.createRandom().address
const GAUGE_B = ethers.Wallet.createRandom().address
const GAUGE_C = ethers.Wallet.createRandom().address

describe.skip('GaugeRewardDistribution — integration', function () {
  this.timeout(600_000)
  this.slow(0)

  /**
   * Scenario: 5 stakers with cross-delegation pools
   *
   * Stakers & delegation:
   *   [0] 1000 CTX → self-delegates (voter)
   *   [1] 2000 CTX → self-delegates (voter)
   *   [2] 3000 CTX → delegates to staker[0]
   *   [3] 4000 CTX → delegates to staker[1]
   *   [4] 5000 CTX → delegates to staker[0]
   *
   * Effective VP when voting:
   *   staker[0] votes with: own(1k) + [2](3k) + [4](5k) ≈ 9k VP
   *   staker[1] votes with: own(2k) + [3](4k) ≈ 6k VP
   *
   * Vote allocation:
   *   staker[0] → 60% gauge A, 40% gauge C
   *   staker[1] → 50% gauge A, 50% gauge B
   *
   * Expected gauge VP (approx):
   *   Gauge A: 60% of 9k + 50% of 6k ≈ 8.4k (largest)
   *   Gauge C: 40% of 9k ≈ 3.6k
   *   Gauge B: 50% of 6k ≈ 3k (smallest)
   *   Order: A > C > B
   */
  describe('delegated voting pools', () => {
    let dep: GaugesDaoDeployment
    let result: GaugeVotingResult

    before(async () => {
      await resetFork()
      const startBlock = await getAnvilProvider().getBlockNumber()

      dep = await setupGaugesDaoLight()

      result = await runGaugeVotingActivity(dep, {
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
          { from: 3, to: 1 },
          { from: 4, to: 0 },
        ],
        gauges: [
          { address: GAUGE_A, metadataURI: '0x' },
          { address: GAUGE_B, metadataURI: '0x' },
          { address: GAUGE_C, metadataURI: '0x' },
        ],
        votes: [
          {
            from: 0,
            votes: [
              { gaugeIndex: 0, weight: 60 },
              { gaugeIndex: 2, weight: 40 },
            ],
          },
          {
            from: 1,
            votes: [
              { gaugeIndex: 0, weight: 50 },
              { gaugeIndex: 1, weight: 50 },
            ],
          },
        ],
      })

      const latestBlock = await getAnvilProvider().getBlockNumber()
      await startServices(startBlock)
      await waitForIndexerCatchup(latestBlock, 180_000)
    })

    after(() => stopServices())

    it('indexes VoteGauge records for all gauge votes', async () => {
      const voteGauges = await Models.VoteGauge.find({
        network: NETWORK,
        pluginAddress: dep.gaugeVoter,
      })
      // staker[0] → 2 gauges, staker[1] → 2 gauges = 4 VoteGauge records
      expect(voteGauges.length, 'expected 4 VoteGauge records').to.equal(4)
    })

    it('indexes Gauge records for all registered gauges', async () => {
      const gauges = await Models.Gauge.find({
        network: NETWORK,
        pluginAddress: dep.gaugeVoter,
      })
      expect(gauges.length, 'expected 3 Gauge records').to.equal(3)
    })

    it('distributes rewards proportionally with delegation pools', async () => {
      const totalAmount = ethers.parseEther('1000')

      const calc = new GaugeRewardDistribution({
        pluginAddress: dep.gaugeVoter as HexAddress,
        network: NETWORK,
        epochId: result.epochId,
        rewardTotalAmount: totalAmount,
      })

      const computed = await calc.compute()
      expect(computed, 'compute() should not return null').to.not.be.null
      expect(computed).to.not.have.property('error')

      const res = computed as any
      expect(res.gaugeRewards).to.be.an('array')
      expect(res.gaugeRewards.length).to.equal(3)

      // Total distributed must equal totalAmount exactly
      const distributedSum = res.gaugeRewards.reduce((sum: bigint, r: any) => sum + r.rewardAmount, 0n)
      expect(distributedSum, 'distributed sum should equal totalAmount').to.equal(totalAmount)

      // All gauges should have non-zero rewards
      for (const reward of res.gaugeRewards) {
        expect(reward.rewardAmount > 0n, `gauge ${reward.gauge} should have non-zero reward`).to.be.true
        expect(reward.votingPower > 0n, `gauge ${reward.gauge} should have non-zero VP`).to.be.true
      }

      const rewardA = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_A.toLowerCase())
      const rewardB = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_B.toLowerCase())
      const rewardC = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_C.toLowerCase())
      expect(rewardA, 'gauge A reward should exist').to.exist
      expect(rewardB, 'gauge B reward should exist').to.exist
      expect(rewardC, 'gauge C reward should exist').to.exist

      // Gauge A > Gauge C > Gauge B (reflects delegation pool sizes + weight allocation)
      expect(rewardA.rewardAmount > rewardC.rewardAmount, 'gauge A > gauge C').to.be.true
      expect(rewardC.rewardAmount > rewardB.rewardAmount, 'gauge C > gauge B').to.be.true
    })

    it('returns correct metadata in result', async () => {
      const totalAmount = ethers.parseEther('500')

      const calc = new GaugeRewardDistribution({
        pluginAddress: dep.gaugeVoter as HexAddress,
        network: NETWORK,
        epochId: result.epochId,
        rewardTotalAmount: totalAmount,
      })

      const computed = await calc.compute()
      const res = computed as any

      expect(res.epoch).to.equal(result.epochId)
      expect(res.pluginAddress).to.equal(dep.gaugeVoter)
      expect(res.network).to.equal(NETWORK)
      expect(res.totalVotingPower > 0n, 'totalVotingPower should be > 0').to.be.true
      expect(res.rewardTotalAmount).to.equal(totalAmount)
    })

    it('totalVotingPower equals sum of per-gauge VP', async () => {
      const calc = new GaugeRewardDistribution({
        pluginAddress: dep.gaugeVoter as HexAddress,
        network: NETWORK,
        epochId: result.epochId,
        rewardTotalAmount: 1000n,
      })

      const computed = await calc.compute()
      const res = computed as any

      const sumGaugeVP = res.gaugeRewards.reduce((sum: bigint, r: any) => sum + r.votingPower, 0n)
      expect(sumGaugeVP).to.equal(res.totalVotingPower)

      // VP ordering matches delegation pool sizes × weight allocation
      const vpA = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_A.toLowerCase()).votingPower
      const vpB = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_B.toLowerCase()).votingPower
      const vpC = res.gaugeRewards.find((r: any) => r.gauge.toLowerCase() === GAUGE_C.toLowerCase()).votingPower
      expect(vpA > vpC, 'gauge A VP > gauge C VP').to.be.true
      expect(vpC > vpB, 'gauge C VP > gauge B VP').to.be.true
    })
  })
})
