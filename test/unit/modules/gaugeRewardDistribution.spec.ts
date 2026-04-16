import config from '@config'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeRewardDistribution from '@modules/gaugeRewardDistribution'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x1652FDd272fEf49B53bd102550DE775519e60b8E'
const CLOCK = '0xA01de789D297B568A20e462660E3e9fB5553677e'
const NETWORK = NetworksEnum.ethereumSepolia
const TOTAL = 1000000000000000000000n // 1000e18

const GAUGE_A = '0x000000000000000000000000000000000000aaaa'
const GAUGE_B = '0x000000000000000000000000000000000000bbbb'
const GAUGE_C = '0x000000000000000000000000000000000000cccc'

const VOTING_PERIOD = { epochStart: 1000000, voteEnd: 1604800, epochDuration: 1209600 }

describe('GaugeRewardDistribution', () => {
  let sandbox: SinonSandbox
  let configRewardsBackup: { ALLOW_EARLY_REWARD_GENERATION: boolean; ALLOW_RETROACTIVE_REWARDS: boolean }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    configRewardsBackup = { ...config.REWARDS }
    config.REWARDS.ALLOW_EARLY_REWARD_GENERATION = true
    config.REWARDS.ALLOW_RETROACTIVE_REWARDS = true
  })

  afterEach(() => {
    sandbox.restore()
    config.REWARDS.ALLOW_EARLY_REWARD_GENERATION = configRewardsBackup.ALLOW_EARLY_REWARD_GENERATION
    config.REWARDS.ALLOW_RETROACTIVE_REWARDS = configRewardsBackup.ALLOW_RETROACTIVE_REWARDS
  })

  function stubInit() {
    sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
    sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves(VOTING_PERIOD)
  }

  function stubPerGaugeVP(map: Map<string, bigint>) {
    sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(map)
  }

  function createModule(overrides: Partial<{ epochId: number; rewardTotalAmount: bigint }> = {}) {
    return new GaugeRewardDistribution({
      pluginAddress: PLUGIN,
      network: NETWORK,
      epochId: overrides.epochId ?? 1,
      rewardTotalAmount: overrides.rewardTotalAmount ?? TOTAL,
    })
  }

  describe('compute', () => {
    it('should return null when clock address cannot be resolved', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null as any)
      const result = await createModule().compute()
      expect(result).to.be.null
    })

    it('should return null when voting period cannot be resolved', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves(null)
      const result = await createModule().compute()
      expect(result).to.be.null
    })

    it('should return error when voting has not closed', async () => {
      config.REWARDS.ALLOW_EARLY_REWARD_GENERATION = false
      const futureVoteEnd = Math.floor(Date.now() / 1000) + 86400
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({
        epochStart: futureVoteEnd - 604800,
        voteEnd: futureVoteEnd,
        epochDuration: 1209600,
      })

      const result = await createModule().compute()
      expect(result).to.have.property('errorKey', 'epochVotingNotClosed')
    })

    it('should return error when epoch window has expired', async () => {
      config.REWARDS.ALLOW_RETROACTIVE_REWARDS = false
      const pastEpochStart = Math.floor(Date.now() / 1000) - 1209600 * 2
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({
        epochStart: pastEpochStart,
        voteEnd: pastEpochStart + 604800,
        epochDuration: 1209600,
      })

      const result = await createModule().compute()
      expect(result).to.have.property('errorKey', 'epochWindowExpired')
    })

    it('should return empty gaugeRewards when no votes exist', async () => {
      stubInit()
      stubPerGaugeVP(new Map())

      const result = await createModule().compute()
      expect(result).to.not.be.null
      expect(result).to.not.have.property('error')
      const res = result as any
      expect(res.gaugeRewards).to.have.lengthOf(0)
      expect(res.totalVotingPower).to.equal(0n)
    })

    it('should give single gauge the full amount', async () => {
      stubInit()
      stubPerGaugeVP(new Map([[GAUGE_A, 500n]]))

      const result = await createModule().compute()
      const res = result as any
      expect(res.gaugeRewards).to.have.lengthOf(1)
      expect(res.gaugeRewards[0].gauge).to.equal(GAUGE_A)
      expect(res.gaugeRewards[0].rewardAmount).to.equal(TOTAL)
    })

    it('should distribute pro-rata across multiple gauges', async () => {
      stubInit()
      stubPerGaugeVP(
        new Map([
          [GAUGE_A, 600n],
          [GAUGE_B, 400n],
        ]),
      )

      const result = await createModule().compute()
      const res = result as any
      expect(res.gaugeRewards).to.have.lengthOf(2)

      const a = res.gaugeRewards.find((r: any) => r.gauge === GAUGE_A)
      const b = res.gaugeRewards.find((r: any) => r.gauge === GAUGE_B)

      expect(a.rewardAmount).to.equal(600000000000000000000n)
      expect(b.rewardAmount).to.equal(400000000000000000000n)
      expect(a.rewardAmount + b.rewardAmount).to.equal(TOTAL)
    })

    it('should assign dust to the gauge with the highest VP', async () => {
      stubInit()
      stubPerGaugeVP(
        new Map([
          [GAUGE_A, 200n],
          [GAUGE_B, 100n],
        ]),
      )

      const totalAmount = 1000n
      const result = await createModule({ rewardTotalAmount: totalAmount }).compute()
      const res = result as any

      const a = res.gaugeRewards.find((r: any) => r.gauge === GAUGE_A)
      const b = res.gaugeRewards.find((r: any) => r.gauge === GAUGE_B)

      // 1000 * 200/300 = 666, 1000 * 100/300 = 333, dust = 1 → goes to A
      expect(a.rewardAmount).to.equal(667n)
      expect(b.rewardAmount).to.equal(333n)
      expect(a.rewardAmount + b.rewardAmount).to.equal(totalAmount)
    })

    it('should distribute across three gauges with dust to highest VP', async () => {
      stubInit()
      stubPerGaugeVP(
        new Map([
          [GAUGE_A, 100n],
          [GAUGE_B, 100n],
          [GAUGE_C, 100n],
        ]),
      )

      const totalAmount = 1000n
      const result = await createModule({ rewardTotalAmount: totalAmount }).compute()
      const res = result as any

      const total = res.gaugeRewards.reduce((sum: bigint, r: any) => sum + r.rewardAmount, 0n)
      expect(total).to.equal(totalAmount)
    })

    it('should include correct metadata in result', async () => {
      stubInit()
      stubPerGaugeVP(new Map([[GAUGE_A, 500n]]))

      const result = await createModule().compute()
      const res = result as any
      expect(res.epoch).to.equal(1)
      expect(res.pluginAddress).to.equal(PLUGIN)
      expect(res.network).to.equal(NETWORK)
      expect(res.totalVotingPower).to.equal(500n)
      expect(res.rewardTotalAmount).to.equal(TOTAL)
    })
  })
})
