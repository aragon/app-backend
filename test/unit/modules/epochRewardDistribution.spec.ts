import { Models } from '@dbModels'
import EpochRewardDistribution from '@modules/epochRewardDistribution'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'
const CAP_DIST = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ALICE = '0x000000000000000000000000000000000000aaaa'
const BOB = '0x000000000000000000000000000000000000BbBB'
const NETWORK = NetworksEnum.ethereumMainnet

const EPOCH_DURATION = 1209600
const VOTE_DURATION = 604800
const VOTE_WINDOW_BUFFER = 3600
const SNAPSHOT_BUFFER = 300

function makeVotingPeriod(epochId: number) {
  const epochStart = epochId * EPOCH_DURATION
  const voteEnd = epochStart + VOTE_DURATION - VOTE_WINDOW_BUFFER
  return { epochStart, voteEnd, epochDuration: EPOCH_DURATION }
}

describe('EpochRewardDistribution', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('validateEpochWindow', () => {
    it('should return null when within the valid window', () => {
      const votingPeriod = makeVotingPeriod(5)
      const validTime = votingPeriod.voteEnd + SNAPSHOT_BUFFER + 10
      sandbox.stub(Date, 'now').returns(validTime * 1000)

      const result = EpochRewardDistribution.validateEpochWindow(5, votingPeriod)
      expect(result).to.be.null
    })

    it('should return error when voting window has not closed', () => {
      const votingPeriod = makeVotingPeriod(5)
      const earlyTime = votingPeriod.voteEnd + 100
      sandbox.stub(Date, 'now').returns(earlyTime * 1000)

      const result = EpochRewardDistribution.validateEpochWindow(5, votingPeriod)
      expect(result).to.include('Voting window has not closed')
    })

    it('should return error when epoch publish window has passed', () => {
      const votingPeriod = makeVotingPeriod(5)
      const lateTime = votingPeriod.epochStart + EPOCH_DURATION + 1
      sandbox.stub(Date, 'now').returns(lateTime * 1000)

      const result = EpochRewardDistribution.validateEpochWindow(5, votingPeriod)
      expect(result).to.include('publish window has passed')
    })

    it('should return error at exactly the next epoch start', () => {
      const votingPeriod = makeVotingPeriod(5)
      const exactNextEpoch = votingPeriod.epochStart + EPOCH_DURATION
      sandbox.stub(Date, 'now').returns(exactNextEpoch * 1000)

      const result = EpochRewardDistribution.validateEpochWindow(5, votingPeriod)
      expect(result).to.include('publish window has passed')
    })

    it('should return null at exactly backend_snapshot_ts', () => {
      const votingPeriod = makeVotingPeriod(5)
      const exactSnapshot = votingPeriod.voteEnd + SNAPSHOT_BUFFER
      sandbox.stub(Date, 'now').returns(exactSnapshot * 1000)

      const result = EpochRewardDistribution.validateEpochWindow(5, votingPeriod)
      expect(result).to.be.null
    })
  })

  describe('toMap', () => {
    it('should convert results array to bigint map using default field', () => {
      const results = [
        { address: ALICE, total: '1000' },
        { address: BOB, total: '2000' },
      ]
      const map = EpochRewardDistribution.toMap(results)
      expect(map[ALICE]).to.equal(1000n)
      expect(map[BOB]).to.equal(2000n)
    })

    it('should convert results using a custom field', () => {
      const results = [{ address: ALICE, totalClaimed: '500' }]
      const map = EpochRewardDistribution.toMap(results, 'totalClaimed')
      expect(map[ALICE]).to.equal(500n)
    })

    it('should default to 0n for missing/null field', () => {
      const results = [{ address: ALICE }]
      const map = EpochRewardDistribution.toMap(results)
      expect(map[ALICE]).to.equal(0n)
    })

    it('should handle empty array', () => {
      const map = EpochRewardDistribution.toMap([])
      expect(Object.keys(map)).to.have.lengthOf(0)
    })
  })

  describe('getClaimedMap', () => {
    it('should return empty map when no campaign ids', async () => {
      const result = await EpochRewardDistribution.getClaimedMap([], CAP_DIST, NETWORK)
      expect(Object.keys(result)).to.have.lengthOf(0)
    })

    it('should aggregate claimed amounts by user address', async () => {
      sandbox.stub(Models.CampaignReward, 'aggregate').resolves([
        { address: ALICE, totalClaimed: '300' },
        { address: BOB, totalClaimed: '100' },
      ])

      const result = await EpochRewardDistribution.getClaimedMap(['campaign-1'], CAP_DIST, NETWORK)
      expect(result[ALICE]).to.equal(300n)
      expect(result[BOB]).to.equal(100n)
    })
  })

  describe('getAdjustedRewards', () => {
    function stubValidWindow() {
      const votingPeriod = makeVotingPeriod(5)
      const validTime = votingPeriod.voteEnd + SNAPSHOT_BUFFER + 10
      sandbox.stub(Date, 'now').returns(validTime * 1000)
      return votingPeriod
    }

    it('should throw when epoch window is invalid', async () => {
      const votingPeriod = makeVotingPeriod(5)
      sandbox.stub(Date, 'now').returns(votingPeriod.voteEnd * 1000)

      try {
        await EpochRewardDistribution.getAdjustedRewards({
          epochId: 5,
          votingPeriod,
          capitalDistributorAddress: CAP_DIST,
          network: NETWORK,
          currentRewards: [],
          gaugeVoterPlugin: PLUGIN,
        })
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.message).to.include('Voting window has not closed')
      }
    })

    it('should throw when epoch rewards already published', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves({ id: 'existing' } as any)

      try {
        await EpochRewardDistribution.getAdjustedRewards({
          epochId: 5,
          votingPeriod,
          capitalDistributorAddress: CAP_DIST,
          network: NETWORK,
          currentRewards: [],
          gaugeVoterPlugin: PLUGIN,
        })
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.message).to.include('already published')
      }
    })

    it('should throw when previous campaigns are not ended', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves(null)
      sandbox.stub(Models.EpochReward, 'getActiveCampaignIds').resolves(['campaign-1'])
      sandbox.stub(Models.Campaign, 'hasOpenCampaigns').resolves(true)

      try {
        await EpochRewardDistribution.getAdjustedRewards({
          epochId: 5,
          votingPeriod,
          capitalDistributorAddress: CAP_DIST,
          network: NETWORK,
          currentRewards: [{ address: ALICE, amount: '1000' }],
          gaugeVoterPlugin: PLUGIN,
        })
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.message).to.include('Previous campaigns must be ended')
      }
    })

    it('should return current rewards as-is for first epoch (no prior data)', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves(null)
      sandbox.stub(Models.EpochReward, 'getActiveCampaignIds').resolves([])
      sandbox.stub(Models.Campaign, 'hasOpenCampaigns').resolves(false)
      sandbox.stub(Models.EpochReward, 'getCumulativeRewardsMap').resolves([])
      sandbox.stub(Models.CampaignReward, 'aggregate').resolves([])

      const result = await EpochRewardDistribution.getAdjustedRewards({
        epochId: 5,
        votingPeriod,
        capitalDistributorAddress: CAP_DIST,
        network: NETWORK,
        currentRewards: [
          { address: ALICE, amount: '1000' },
          { address: BOB, amount: '500' },
        ],
        gaugeVoterPlugin: PLUGIN,
      })

      expect(result).to.have.lengthOf(2)
      const alice = result.find(r => r.address === ALICE)!
      const bob = result.find(r => r.address === BOB)!
      expect(alice.amount).to.equal('1000')
      expect(bob.amount).to.equal('500')
    })

    it('should accumulate past rewards and subtract claimed', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves(null)
      sandbox.stub(Models.EpochReward, 'getActiveCampaignIds').resolves(['campaign-1'])
      sandbox.stub(Models.Campaign, 'hasOpenCampaigns').resolves(false)
      sandbox.stub(Models.EpochReward, 'getCumulativeRewardsMap').resolves([
        { address: ALICE, total: '500' },
        { address: BOB, total: '200' },
      ])
      sandbox.stub(Models.CampaignReward, 'aggregate').resolves([{ address: ALICE, totalClaimed: '300' }])

      const result = await EpochRewardDistribution.getAdjustedRewards({
        epochId: 5,
        votingPeriod,
        capitalDistributorAddress: CAP_DIST,
        network: NETWORK,
        currentRewards: [
          { address: ALICE, amount: '1000' },
          { address: BOB, amount: '500' },
        ],
        gaugeVoterPlugin: PLUGIN,
      })

      const alice = result.find(r => r.address === ALICE)!
      const bob = result.find(r => r.address === BOB)!
      // Alice: cumulative(500) + current(1000) - claimed(300) = 1200
      expect(alice.amount).to.equal('1200')
      // Bob: cumulative(200) + current(500) - claimed(0) = 700
      expect(bob.amount).to.equal('700')
    })

    it('should filter out addresses with zero or negative adjusted amount', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves(null)
      sandbox.stub(Models.EpochReward, 'getActiveCampaignIds').resolves(['campaign-1'])
      sandbox.stub(Models.Campaign, 'hasOpenCampaigns').resolves(false)
      sandbox.stub(Models.EpochReward, 'getCumulativeRewardsMap').resolves([{ address: ALICE, total: '500' }])
      sandbox.stub(Models.CampaignReward, 'aggregate').resolves([{ address: ALICE, totalClaimed: '500' }])

      const result = await EpochRewardDistribution.getAdjustedRewards({
        epochId: 5,
        votingPeriod,
        capitalDistributorAddress: CAP_DIST,
        network: NETWORK,
        currentRewards: [],
        gaugeVoterPlugin: PLUGIN,
      })

      // Alice: cumulative(500) + current(0) - claimed(500) = 0 → filtered out
      expect(result).to.have.lengthOf(0)
    })

    it('should pass when previous campaigns were never started on-chain', async () => {
      const votingPeriod = stubValidWindow()
      sandbox.stub(Models.EpochReward, 'findByEpoch').resolves(null)
      sandbox.stub(Models.EpochReward, 'getActiveCampaignIds').resolves(['draft-abc123'])
      sandbox.stub(Models.Campaign, 'hasOpenCampaigns').resolves(false)
      sandbox.stub(Models.EpochReward, 'getCumulativeRewardsMap').resolves([{ address: ALICE, total: '500' }])
      sandbox.stub(Models.CampaignReward, 'aggregate').resolves([])

      const result = await EpochRewardDistribution.getAdjustedRewards({
        epochId: 5,
        votingPeriod,
        capitalDistributorAddress: CAP_DIST,
        network: NETWORK,
        currentRewards: [{ address: ALICE, amount: '200' }],
        gaugeVoterPlugin: PLUGIN,
      })

      const alice = result.find(r => r.address === ALICE)!
      // cumulative(500) + current(200) - claimed(0) = 700
      expect(alice.amount).to.equal('700')
    })
  })

  describe('reconcileDraftCampaignId', () => {
    it('should update campaignId on existing epoch reward', async () => {
      const updateStub = sandbox.stub().resolves()
      sandbox.stub(Models.EpochReward, 'findByCampaignId').resolves({ update: updateStub } as any)

      await EpochRewardDistribution.reconcileDraftCampaignId(CAP_DIST, NETWORK, 'draft-123', 'real-456')

      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.args[0][0]).to.deep.equal({ campaignId: 'real-456' })
    })

    it('should do nothing when epoch reward not found', async () => {
      sandbox.stub(Models.EpochReward, 'findByCampaignId').resolves(null)

      await EpochRewardDistribution.reconcileDraftCampaignId(CAP_DIST, NETWORK, 'draft-123', 'real-456')
      // no error thrown
    })
  })

  describe('saveEpochReward', () => {
    it('should create epoch reward with computed total', async () => {
      const createStub = sandbox.stub(Models.EpochReward, 'create').resolves({} as any)

      await EpochRewardDistribution.saveEpochReward({
        gaugeVoterPlugin: PLUGIN,
        capitalDistributorAddress: CAP_DIST,
        network: NETWORK,
        epochId: 5,
        campaignId: 'campaign-1',
        rewards: [
          { address: ALICE, amount: '1000' },
          { address: BOB, amount: '500' },
        ],
      })

      expect(createStub.calledOnce).to.be.true
      const arg = createStub.args[0][0]
      expect(arg.pluginAddress).to.equal(PLUGIN)
      expect(arg.capitalDistributorAddress).to.equal(CAP_DIST)
      expect(arg.epochId).to.equal(5)
      expect(arg.rewardTotalAmount).to.equal('1500')
      expect(arg.rewards).to.have.lengthOf(2)
    })
  })
})
