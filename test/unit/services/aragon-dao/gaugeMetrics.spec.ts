import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'

describe('Service: GaugeMetrics', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('epochGaugeMetrics', () => {
    it('should create new gauge metrics when they do not exist', async () => {
      const gaugeAddress = '0xGauge11111111111111111111111111111111'
      const pluginAddress = '0xPlugin1111111111111111111111111111111'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '5'
      const currentEpochVotingPower = '8000000000000000000'
      const totalGaugeVotingPower = '5000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(10)

      // Stub contract calls
      sandbox.stub(GaugeHelper, 'getGaugeVotes').resolves(currentEpochVotingPower)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves(totalGaugeVotingPower)

      const findMetricsStub = sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(findGaugeStub.calledWith({ address: gaugeAddress, network, pluginAddress })).to.be.true

      expect(countVotesStub.calledOnce).to.be.true
      expect(countVotesStub.calledWith(epochId, pluginAddress, gaugeAddress, network)).to.be.true

      expect(findMetricsStub.calledOnce).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true

      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('New Gauge metrics')
    })

    it('should update existing gauge metrics', async () => {
      const gaugeAddress = '0xGauge22222222222222222222222222222222'
      const pluginAddress = '0xPlugin2222222222222222222222222222222'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '10'
      const currentEpochVotingPower = '20000000000000000000'
      const totalGaugeVotingPower = '15000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const mockExistingMetrics = {
        update: sandbox.stub().resolves({}),
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(25)

      // Stub contract calls
      sandbox.stub(GaugeHelper, 'getGaugeVotes').resolves(currentEpochVotingPower)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves(totalGaugeVotingPower)

      const findMetricsStub = sandbox
        .stub(Models.GaugeMetrics, 'findByGaugeAndEpoch')
        .resolves(mockExistingMetrics as any)

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(countVotesStub.calledOnce).to.be.true
      expect(findMetricsStub.calledOnce).to.be.true

      expect(mockExistingMetrics.update.calledOnce).to.be.true
      expect(
        mockExistingMetrics.update.calledWith({
          totalMemberVoteCount: 25,
          currentEpochVotingPower: '20000000000000000000',
          totalGaugeVotingPower: '15000000000000000000',
        }),
      ).to.be.true

      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Update Gauge metrics')
    })

    it('should return early and warn if gauge not found', async () => {
      const gaugeAddress = '0xNonExistentGauge11111111111111111111'
      const pluginAddress = '0xPlugin3333333333333333333333333333333'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '1'

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Gauge not found')

      // Should not proceed to count votes
      expect(countVotesStub.called).to.be.false
    })

    it('should get epochId from Web3Helper when not provided', async () => {
      const gaugeAddress = '0xGauge33333333333333333333333333333333'
      const pluginAddress = '0xPlugin4444444444444444444444444444444'
      const network = NetworksEnum.ethereumMainnet
      const retrievedEpochId = '15'
      const currentEpochVotingPower = '4000000000000000000'
      const totalGaugeVotingPower = '2000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const getGaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(retrievedEpochId)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(5)

      // Stub contract calls
      sandbox.stub(GaugeHelper, 'getGaugeVotes').resolves(currentEpochVotingPower)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves(totalGaugeVotingPower)

      sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId: null,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledWith(pluginAddress, network)).to.be.true
      expect(countVotesStub.calledWith(retrievedEpochId, pluginAddress, gaugeAddress, network)).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true
    })

    it('should return early and log error if epochId cannot be retrieved from Web3Helper', async () => {
      const gaugeAddress = '0xGauge44444444444444444444444444444444'
      const pluginAddress = '0xPlugin5555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const getGaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(null)
      const errorStub = sandbox.stub(logger, 'error')
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge')

      await GaugeMetrics.epochGaugeMetrics({
        epochId: null,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error getting gauge lastEpochId')

      // Should not proceed to count votes
      expect(countVotesStub.called).to.be.false
    })

    it('should pass correct parameters to create when creating new metrics', async () => {
      const gaugeAddress = '0xGauge55555555555555555555555555555555'
      const pluginAddress = '0xPlugin6666666666666666666666666666666'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '20'
      const totalMemberVoteCount = 42
      const currentEpochVotingPower = '10000000000000000000'
      const totalGaugeVotingPower = '8888888888888888888'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(totalMemberVoteCount)
      sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)

      // Stub contract calls
      sandbox.stub(GaugeHelper, 'getGaugeVotes').resolves(currentEpochVotingPower)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves(totalGaugeVotingPower)

      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(createMetricsStub.calledOnce).to.be.true
      expect(
        createMetricsStub.calledWith({
          network,
          pluginAddress,
          gaugeAddress,
          epochId,
          totalMemberVoteCount,
          currentEpochVotingPower,
          totalGaugeVotingPower,
        }),
      ).to.be.true
    })

    it('should handle zero vote count and voting power', async () => {
      const gaugeAddress = '0xGauge66666666666666666666666666666666'
      const pluginAddress = '0xPlugin7777777777777777777777777777777'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '3'
      const currentEpochVotingPower = '0'
      const totalGaugeVotingPower = '0'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(0)

      // Stub contract calls
      sandbox.stub(GaugeHelper, 'getGaugeVotes').resolves(currentEpochVotingPower)
      sandbox.stub(GaugeHelper, 'totalVotingPowerCast').resolves(totalGaugeVotingPower)

      const findMetricsStub = sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(countVotesStub.calledOnce).to.be.true
      expect(findMetricsStub.calledOnce).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true
      expect(verboseStub.calledOnce).to.be.true
    })
  })
})
