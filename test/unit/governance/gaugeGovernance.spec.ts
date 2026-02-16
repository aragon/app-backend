import '@test/environment'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import Logger from '@logger'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'
import { BaseGovernance, GaugeGovernance } from '@src/governance'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Governance:GaugeGovernance', () => {
  let sandbox: SinonSandbox
  let gaugeGovernance: GaugeGovernance
  let loggerWarnStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testGaugeAddress = '0xgaugegaugegaugegaugegaugegaugegaugegauge' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    gaugeGovernance = new GaugeGovernance(testGaugeAddress, testNetwork)

    loggerWarnStub = sandbox.stub(Logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('inheritance', () => {
    it('should extend BaseGovernance', () => {
      expect(gaugeGovernance).to.be.instanceOf(GaugeGovernance)
      expect(gaugeGovernance).to.be.instanceOf(BaseGovernance)
    })

    it('should have all BaseGovernance methods', () => {
      expect(gaugeGovernance.getOrCreate).to.be.a('function')
      expect(gaugeGovernance.create).to.be.a('function')
      expect(gaugeGovernance.update).to.be.a('function')
      expect(gaugeGovernance.delete).to.be.a('function')
      expect(gaugeGovernance.findOne).to.be.a('function')
      expect(gaugeGovernance.findAndPaginateMembers).to.be.a('function')
      expect(gaugeGovernance.updateDaoMetrics).to.be.a('function')
      expect(gaugeGovernance.createGauge).to.be.a('function')
    })
  })

  describe('constructor', () => {
    it('should initialize with gauge address and network', () => {
      const governance = new GaugeGovernance(testGaugeAddress, testNetwork)
      expect(governance['address']).to.equal(testGaugeAddress)
      expect(governance['network']).to.equal(testNetwork)
    })
  })

  describe('getOrCreate', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.getOrCreate()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement getOrCreate member')
    })
  })

  describe('create', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.create()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement create member')
    })
  })

  describe('update', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.update()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement update member')
    })
  })

  describe('delete', () => {
    it('should log warning and return false', async () => {
      const result = await gaugeGovernance.delete()

      expect(result).to.be.false
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement delete member')
    })
  })

  describe('findOne', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.findOne()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement findOne member')
    })
  })

  describe('findAndPaginateMembers', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.findAndPaginateMembers()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement findAndPaginateMembers members')
    })
  })

  describe('updateDaoMetrics', () => {
    it('should log warning and return null', async () => {
      const result = await gaugeGovernance.updateDaoMetrics()

      expect(result).to.be.null
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.args[0][0]).to.equal('Gauge governance does not implement updateDaoMetrics')
    })
  })

  describe('getActiveVoters', () => {
    it('should return ActiveVoter[] with correct bigint conversion', async () => {
      const mockAggregateResult = [
        {
          _id: '0xAlice0000000000000000000000000000000001',
          totalVotingPower: '60000000000000000000',
          latestTxHash: '0xabc123',
          latestBlock: 100,
          latestBlockTimestamp: 1700000000,
        },
        {
          _id: '0xBob00000000000000000000000000000000000b',
          totalVotingPower: '40000000000000000000',
          latestTxHash: '0xdef456',
          latestBlock: 99,
          latestBlockTimestamp: 1699999000,
        },
      ]

      const aggregateStub = sandbox.stub(Models.VoteGauge, 'aggregate').resolves(mockAggregateResult)

      const result = await GaugeGovernance.getActiveVoters(testPluginAddress, testNetwork, 2000)

      expect(aggregateStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(2)
      expect(result[0].voter).to.equal('0xAlice0000000000000000000000000000000001')
      expect(result[0].usedVP).to.equal(60000000000000000000n)
      expect(result[0].latestTxHash).to.equal('0xabc123')
      expect(result[0].latestBlock).to.equal(100)
      expect(result[0].latestBlockTimestamp).to.equal(1700000000)
      expect(result[1].usedVP).to.equal(40000000000000000000n)
    })

    it('should return empty array when no voters found', async () => {
      sandbox.stub(Models.VoteGauge, 'aggregate').resolves([])

      const result = await GaugeGovernance.getActiveVoters(testPluginAddress, testNetwork, 2000)

      expect(result).to.have.lengthOf(0)
    })
  })

  describe('getPerGaugeVP', () => {
    it('should return Map<string, bigint> with correct conversion', async () => {
      const mockAggregateResult = [
        { _id: '0xGauge1', totalGaugeVP: '100000000000000000000' },
        { _id: '0xGauge2', totalGaugeVP: '50000000000000000000' },
      ]

      const aggregateStub = sandbox.stub(Models.VoteGauge, 'aggregate').resolves(mockAggregateResult)

      const result = await GaugeGovernance.getPerGaugeVP(testPluginAddress, testNetwork, 2000)

      expect(aggregateStub.calledOnce).to.be.true
      expect(result).to.be.instanceOf(Map)
      expect(result.size).to.equal(2)
      expect(result.get('0xGauge1')).to.equal(100000000000000000000n)
      expect(result.get('0xGauge2')).to.equal(50000000000000000000n)
    })

    it('should handle decimal values by truncating to integer', async () => {
      const mockAggregateResult = [{ _id: '0xGauge1', totalGaugeVP: '100000000000000000000.5' }]

      sandbox.stub(Models.VoteGauge, 'aggregate').resolves(mockAggregateResult)

      const result = await GaugeGovernance.getPerGaugeVP(testPluginAddress, testNetwork, 2000)

      expect(result.get('0xGauge1')).to.equal(100000000000000000000n)
    })

    it('should return empty map when no gauges found', async () => {
      sandbox.stub(Models.VoteGauge, 'aggregate').resolves([])

      const result = await GaugeGovernance.getPerGaugeVP(testPluginAddress, testNetwork, 2000)

      expect(result.size).to.equal(0)
    })
  })

  describe('createGauge', () => {
    let createGaugeStub: sinon.SinonStub
    let epochGaugeMetricsStub: sinon.SinonStub
    let getGaugeEpochIdStub: sinon.SinonStub

    beforeEach(() => {
      createGaugeStub = sandbox.stub(Models.Gauge, 'create')
      epochGaugeMetricsStub = sandbox.stub(GaugeMetrics, 'epochGaugeMetrics').resolves()
      getGaugeEpochIdStub = sandbox.stub(GaugeHelper, 'getGaugeEpochId').resolves(null)
    })

    it('should create gauge and trigger metrics calculation', async () => {
      const rawGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        blockNumber: 100,
      }

      const createdGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        blockNumber: 100,
      }

      createGaugeStub.resolves(createdGauge as any)

      const result = await gaugeGovernance.createGauge(rawGauge)

      expect(result).to.deep.equal(createdGauge)
      expect(createGaugeStub.calledOnce).to.be.true
      expect(createGaugeStub.calledWith(rawGauge)).to.be.true

      expect(getGaugeEpochIdStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledWith(testPluginAddress, testNetwork)).to.be.true

      expect(epochGaugeMetricsStub.calledOnce).to.be.true
      expect(
        epochGaugeMetricsStub.calledWith({
          epochId: null,
          gaugeAddress: testGaugeAddress,
          pluginAddress: testPluginAddress,
          network: testNetwork,
        }),
      ).to.be.true
    })

    it('should create gauge with specific epochId from GaugeHelper', async () => {
      const rawGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        blockNumber: 200,
      }

      const createdGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        blockNumber: 200,
      }

      const epochId = '5'
      getGaugeEpochIdStub.resolves(epochId)

      createGaugeStub.resolves(createdGauge as any)

      const result = await gaugeGovernance.createGauge(rawGauge)

      expect(result).to.deep.equal(createdGauge)
      expect(createGaugeStub.calledOnce).to.be.true
      expect(getGaugeEpochIdStub.calledWith(testPluginAddress, testNetwork)).to.be.true

      expect(epochGaugeMetricsStub.calledOnce).to.be.true
      expect(
        epochGaugeMetricsStub.calledWith({
          epochId,
          gaugeAddress: testGaugeAddress,
          pluginAddress: testPluginAddress,
          network: testNetwork,
        }),
      ).to.be.true
    })

    it('should handle partial gauge data', async () => {
      const rawGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const createdGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
        blockNumber: 150,
        createdAt: new Date(),
      }

      createGaugeStub.resolves(createdGauge as any)

      const result = await gaugeGovernance.createGauge(rawGauge)

      expect(result).to.deep.equal(createdGauge)
      expect(createGaugeStub.calledOnce).to.be.true
      expect(epochGaugeMetricsStub.calledOnce).to.be.true

      const callArgs = epochGaugeMetricsStub.getCall(0).args[0]
      expect(callArgs.epochId).to.be.null
      expect(callArgs.gaugeAddress).to.equal(testGaugeAddress)
      expect(callArgs.pluginAddress).to.equal(testPluginAddress)
      expect(callArgs.network).to.equal(testNetwork)
    })

    it('should throw error when Models.Gauge.create fails', async () => {
      const rawGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const error = new Error('Database connection failed')
      createGaugeStub.rejects(error)

      try {
        await gaugeGovernance.createGauge(rawGauge)
        expect.fail('Should have thrown an error')
      } catch (err) {
        expect(err).to.equal(error)
        expect(createGaugeStub.calledOnce).to.be.true
        expect(getGaugeEpochIdStub.called).to.be.false
        expect(epochGaugeMetricsStub.called).to.be.false
      }
    })

    it('should throw error when GaugeMetrics.epochGaugeMetrics fails', async () => {
      const rawGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      const createdGauge = {
        address: testGaugeAddress,
        pluginAddress: testPluginAddress,
        network: testNetwork,
      }

      createGaugeStub.resolves(createdGauge as any)

      const error = new Error('Metrics calculation failed')
      epochGaugeMetricsStub.rejects(error)

      try {
        await gaugeGovernance.createGauge(rawGauge)
        expect.fail('Should have thrown an error')
      } catch (err) {
        expect(err).to.equal(error)
        expect(createGaugeStub.calledOnce).to.be.true
        expect(getGaugeEpochIdStub.calledOnce).to.be.true
        expect(epochGaugeMetricsStub.calledOnce).to.be.true
      }
    })
  })
})
