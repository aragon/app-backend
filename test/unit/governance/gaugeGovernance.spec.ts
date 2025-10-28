import '@test/environment'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { GaugeGovernance, BaseGovernance } from '@src/governance'
import { NetworksEnum, type HexAddress } from '@types'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'
import GaugeHelper from '@helpers/gauge'

describe('Governance:GaugeGovernance', () => {
  let sandbox: SinonSandbox
  let gaugeGovernance: GaugeGovernance
  let loggerWarnStub: sinon.SinonStub
  let loggerVerboseStub: sinon.SinonStub

  const testPluginAddress = '0x1234567890123456789012345678901234567890' as HexAddress
  const testGaugeAddress = '0xgaugegaugegaugegaugegaugegaugegaugegauge' as HexAddress
  const testNetwork = NetworksEnum.ethereumMainnet

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    gaugeGovernance = new GaugeGovernance(testGaugeAddress, testNetwork)

    loggerWarnStub = sandbox.stub(Logger, 'warn')
    loggerVerboseStub = sandbox.stub(Logger, 'verbose')
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
          currentEpochVotingPower: '0',
          totalGaugeVotingPower: '0',
        }),
      ).to.be.true
    })

    it('should create gauge with different epochId from Web3Helper', async () => {
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
          currentEpochVotingPower: '0',
          totalGaugeVotingPower: '0',
        }),
      ).to.be.true
    })

    it('should call GaugeMetrics.epochGaugeMetrics with null epochId', async () => {
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

      await gaugeGovernance.createGauge(rawGauge)

      expect(epochGaugeMetricsStub.calledOnce).to.be.true
      const callArgs = epochGaugeMetricsStub.getCall(0).args[0]
      expect(callArgs.epochId).to.be.null
      expect(callArgs.gaugeAddress).to.equal(testGaugeAddress)
      expect(callArgs.pluginAddress).to.equal(testPluginAddress)
      expect(callArgs.network).to.equal(testNetwork)
      expect(callArgs.currentEpochVotingPower).to.equal('0')
      expect(callArgs.totalGaugeVotingPower).to.equal('0')
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
    })
  })
})
