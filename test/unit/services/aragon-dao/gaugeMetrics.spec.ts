import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbTx from '@modules/dbTx'

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
      const votingPower = '5000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(10)

      const findMetricsStub = sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: 'mock-session' })
      })

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(findGaugeStub.calledWith({ address: gaugeAddress, network })).to.be.true

      expect(countVotesStub.calledOnce).to.be.true
      expect(countVotesStub.calledWith(epochId, gaugeAddress, network)).to.be.true

      expect(executeTxStub.calledOnce).to.be.true
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
      const votingPower = '15000000000000000000'

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

      const findMetricsStub = sandbox
        .stub(Models.GaugeMetrics, 'findByGaugeAndEpoch')
        .resolves(mockExistingMetrics as any)

      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: 'mock-session' })
      })

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(countVotesStub.calledOnce).to.be.true
      expect(executeTxStub.calledOnce).to.be.true
      expect(findMetricsStub.calledOnce).to.be.true

      expect(mockExistingMetrics.update.calledOnce).to.be.true
      expect(
        mockExistingMetrics.update.calledWith(
          {
            voteCount: 25,
            votingPower: '15000000000000000000',
          },
          { session: 'mock-session' },
        ),
      ).to.be.true

      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Update Gauge metrics')
    })

    it('should return early and warn if gauge not found', async () => {
      const gaugeAddress = '0xNonExistentGauge11111111111111111111'
      const pluginAddress = '0xPlugin3333333333333333333333333333333'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '1'
      const votingPower = '1000000000000000000'

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge')
      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Gauge not found')

      // Should not proceed to count votes or execute transaction
      expect(countVotesStub.called).to.be.false
      expect(executeTxStub.called).to.be.false
    })

    it('should get epochId from Web3Helper when not provided', async () => {
      const gaugeAddress = '0xGauge33333333333333333333333333333333'
      const pluginAddress = '0xPlugin4444444444444444444444444444444'
      const network = NetworksEnum.ethereumMainnet
      const retrievedEpochId = '15'
      const votingPower = '2000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const getGaugeEpochIdStub = sandbox.stub(Web3Helper, 'getGaugeEpochId').resolves(retrievedEpochId)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(5)

      const findMetricsStub = sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: 'mock-session' })
      })

      sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId: null,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledWith(pluginAddress, network)).to.be.true
      expect(countVotesStub.calledWith(retrievedEpochId, gaugeAddress, network)).to.be.true
      expect(executeTxStub.calledOnce).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true
    })

    it('should return early and log error if epochId cannot be retrieved from Web3Helper', async () => {
      const gaugeAddress = '0xGauge44444444444444444444444444444444'
      const pluginAddress = '0xPlugin5555555555555555555555555555555'
      const network = NetworksEnum.ethereumMainnet
      const votingPower = '3000000000000000000'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const getGaugeEpochIdStub = sandbox.stub(Web3Helper, 'getGaugeEpochId').resolves(null)
      const errorStub = sandbox.stub(logger, 'error')
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge')
      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn')

      await GaugeMetrics.epochGaugeMetrics({
        epochId: null,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error getting gauge lastEpochId')

      // Should not proceed to count votes or execute transaction
      expect(countVotesStub.called).to.be.false
      expect(executeTxStub.called).to.be.false
    })

    it('should pass correct parameters to create when creating new metrics', async () => {
      const gaugeAddress = '0xGauge55555555555555555555555555555555'
      const pluginAddress = '0xPlugin6666666666666666666666666666666'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '20'
      const voteCount = 42
      const votingPower = '8888888888888888888'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(voteCount)
      sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)

      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: 'mock-session' })
      })

      sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(createMetricsStub.calledOnce).to.be.true
      expect(
        createMetricsStub.calledWith(
          {
            network,
            pluginAddress,
            gaugeAddress,
            epochId,
            voteCount,
            votingPower,
          },
          { session: 'mock-session' },
        ),
      ).to.be.true
    })

    it('should handle zero vote count and voting power', async () => {
      const gaugeAddress = '0xGauge66666666666666666666666666666666'
      const pluginAddress = '0xPlugin7777777777777777777777777777777'
      const network = NetworksEnum.ethereumMainnet
      const epochId = '3'
      const votingPower = '0'

      const mockGauge = {
        address: gaugeAddress,
        network,
        pluginAddress,
      }

      const findGaugeStub = sandbox.stub(Models.Gauge, 'findOne').resolves(mockGauge as any)
      const countVotesStub = sandbox.stub(Models.VoteGauge, 'countActiveVotesByEpochAndGauge').resolves(0)

      const findMetricsStub = sandbox.stub(Models.GaugeMetrics, 'findByGaugeAndEpoch').resolves(null)
      const createMetricsStub = sandbox.stub(Models.GaugeMetrics, 'create').resolves({} as any)

      const executeTxStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: 'mock-session' })
      })

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeMetrics.epochGaugeMetrics({
        epochId,
        gaugeAddress,
        pluginAddress,
        network,
        votingPower,
      })

      expect(findGaugeStub.calledOnce).to.be.true
      expect(countVotesStub.calledOnce).to.be.true
      expect(executeTxStub.calledOnce).to.be.true
      expect(findMetricsStub.calledOnce).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true
      expect(verboseStub.calledOnce).to.be.true
    })
  })
})
