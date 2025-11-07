import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { GaugeHandler } from '@handlers/gaugeHandler'
import { Models } from '@dbModels'
import { NetworksEnum, IPluginStatus, IPluginInterfaceType, ISettingStatus } from '@types'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import IPFSModule from '@modules/ipfs'
import logger from '@logger'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'

describe('Handler: gaugeHandler', () => {
  let sandbox: SinonSandbox
  let mockPlugin: any
  let mockInfo: any
  let getBlockTimestampStub: any
  let extractMetadataUriStub: any
  let fetchMetadataStub: any
  let gaugeMetricsStub: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Create a real plugin in the test database
    mockPlugin = await Models.Plugin.create({
      status: IPluginStatus.installed,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345,
      blockTimestamp: 1620000000,
      transactionHash: '0x123abc',
      address: '0x1234567890123456789012345678901234567890',
      daoAddress: '0x9876543210987654321098765432109876543210',
      pluginSetupRepoAddress: '0x1111111111111111111111111111111111111111',
      interfaceType: IPluginInterfaceType.tokenVoting,
    })

    // Create settings for the plugin
    await Models.Setting.create({
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345,
      transactionHash: '0x123abc',
      pluginAddress: mockPlugin.address,
      daoAddress: mockPlugin.daoAddress,
      supportThreshold: 500000,
      minParticipation: 150000,
      minDuration: 86400,
      minProposerVotingPower: '0',
      votingMode: 0,
      enabledUpdatedVotingPowerHook: false,
      status: ISettingStatus.active,
    })

    // Mock info object that will be passed to all handlers
    mockInfo = {
      address: mockPlugin.address,
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0xabcdef123456789',
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 12346,
    }

    // Stub external dependencies
    getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp')
    extractMetadataUriStub = sandbox.stub(Web3Utils, 'extractMetadataUri')
    fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata')
    gaugeMetricsStub = sandbox.stub(GaugeMetrics, 'epochGaugeMetrics').resolves()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('gaugeCreated', () => {
    it('should warn and return early if gauge already exists', async () => {
      // Create a gauge first
      await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeDuplicate111111111111111111111111',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreator1111111111111111111111111111111',
        name: 'Existing Gauge',
        description: 'Already exists',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          gauge: '0xGaugeDuplicate111111111111111111111111',
          creator: '0xCreator1111111111111111111111111111111',
          metadataURI: 'ipfs://QmTest123',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeCreated(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Duplicate gauge found')

      // Verify fetchMetadata was not called
      expect(fetchMetadataStub.called).to.be.false
    })

    it('should warn and return early if plugin not found', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGaugeNoPlugin11111111111111111111111111',
          creator: '0xCreator1111111111111111111111111111111',
          metadataURI: 'ipfs://QmTest123',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      // Use a different network so plugin won't be found
      const differentNetworkInfo = {
        ...mockInfo,
        address: '0xNonExistentPlugin111111111111111111111',
        network: NetworksEnum.arbitrumMainnet,
      }

      await GaugeHandler.gaugeCreated(parsedEvent, differentNetworkInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('plugin not found in gaugeCreated')

      // Verify fetchMetadata was not called
      expect(fetchMetadataStub.called).to.be.false

      // Verify no gauge was created
      const savedGauge = await Models.Gauge.findOne({
        address: '0xGaugeNoPlugin11111111111111111111111111',
      })
      expect(savedGauge).to.be.null
    })

    it('should create a new gauge with metadata from IPFS', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGauge11111111111111111111111111111111',
          creator: '0xCreator1111111111111111111111111111111',
          metadataURI: 'ipfs://QmTest123',
        },
      } as any

      const mockMetadata = {
        name: 'Test Gauge',
        description: 'This is a test gauge for voting',
        links: ['https://example.com', 'https://docs.example.com'],
        avatar: 'https://example.com/avatar.png',
      }

      extractMetadataUriStub.returns('ipfs://QmTest123')
      fetchMetadataStub.resolves(mockMetadata)
      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeCreated(parsedEvent, mockInfo)

      // Verify the gauge was created in the database
      const savedGauge = await Models.Gauge.findOne({
        address: '0xGauge11111111111111111111111111111111',
        network: mockInfo.network,
      })

      expect(savedGauge).to.exist
      expect(savedGauge.address).to.equal('0xGauge11111111111111111111111111111111')
      expect(savedGauge.pluginAddress).to.equal(mockPlugin.address)
      expect(savedGauge.creatorAddress).to.equal('0xCreator1111111111111111111111111111111')
      expect(savedGauge.name).to.equal('Test Gauge')
      expect(savedGauge.description).to.equal('This is a test gauge for voting')
      expect(savedGauge.links).to.deep.equal(['https://example.com', 'https://docs.example.com'])
      expect(savedGauge.avatar).to.equal('https://example.com/avatar.png')
      expect(savedGauge.isActive).to.be.true
      expect(savedGauge.blockNumber).to.equal(mockInfo.blockNumber)
      expect(savedGauge.transactionHash).to.equal(mockInfo.transactionHash)

      expect(extractMetadataUriStub.calledOnce).to.be.true
      expect(fetchMetadataStub.calledOnce).to.be.true
      expect(fetchMetadataStub.calledWith('ipfs://QmTest123', { retries: 4 })).to.be.true
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge created')
    })

    it('should handle IPFS metadata fetch errors gracefully', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGauge22222222222222222222222222222222',
          creator: '0xCreator2222222222222222222222222222222',
          metadataURI: 'ipfs://QmTest456',
        },
      } as any

      extractMetadataUriStub.returns('ipfs://QmTest456')
      fetchMetadataStub.rejects(new Error('IPFS fetch failed'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeCreated(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error creating gauge')

      // Verify no gauge was created
      const savedGauge = await Models.Gauge.findOne({
        address: '0xGauge22222222222222222222222222222222',
      })
      expect(savedGauge).to.be.null
    })

    it('should handle metadata extraction errors gracefully', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGauge33333333333333333333333333333333',
          creator: '0xCreator3333333333333333333333333333333',
          metadataURI: 'invalid-uri',
        },
      } as any

      extractMetadataUriStub.throws(new Error('Invalid URI'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeCreated(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error creating gauge')

      // Verify no gauge was created
      const savedGauge = await Models.Gauge.findOne({
        address: '0xGauge33333333333333333333333333333333',
      })
      expect(savedGauge).to.be.null
    })
  })

  describe('gaugeActivated', () => {
    it('should activate an existing gauge', async () => {
      // Create a gauge first
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGauge44444444444444444444444444444444',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreator4444444444444444444444444444444',
        name: 'Test Gauge for Activation',
        description: 'Testing activation',
        isActive: false,
      })

      const parsedEvent = {
        args: {
          gauge: gauge.address,
        },
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeActivated(parsedEvent, mockInfo)

      // Verify the gauge was activated
      const updatedGauge = await Models.Gauge.findOne({
        address: gauge.address,
        network: mockInfo.network,
      })

      expect(updatedGauge).to.exist
      expect(updatedGauge.isActive).to.be.true
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge activated')
    })

    it('should warn if gauge not found', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xNonExistentGauge1111111111111111111111',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeActivated(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No gauge found activated')
    })

    it('should handle errors during activation', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGauge55555555555555555555555555555555',
        },
      } as any

      // Force an error by passing undefined
      sandbox.stub(Models.Gauge, 'findOne').rejects(new Error('Database error'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeActivated(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error gaugeActivated')
    })
  })

  describe('gaugeDeactivated', () => {
    it('should deactivate an active gauge', async () => {
      // Create an active gauge first
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGauge66666666666666666666666666666666',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreator6666666666666666666666666666666',
        name: 'Test Gauge for Deactivation',
        description: 'Testing deactivation',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          gauge: gauge.address,
        },
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeDeactivated(parsedEvent, mockInfo)

      // Verify the gauge was deactivated
      const updatedGauge = await Models.Gauge.findOne({
        address: gauge.address,
        network: mockInfo.network,
      })

      expect(updatedGauge).to.exist
      expect(updatedGauge.isActive).to.be.false
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge deactivated')
    })

    it('should warn if gauge not found', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xNonExistentGauge2222222222222222222222',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeDeactivated(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No gauge found deactivated')
    })

    it('should handle errors during deactivation', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xGauge77777777777777777777777777777777',
        },
      } as any

      sandbox.stub(Models.Gauge, 'findOne').rejects(new Error('Database error'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeDeactivated(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error gaugeDeactivated')
    })
  })

  describe('gaugeUpdateMetadata', () => {
    it('should update gauge metadata from IPFS', async () => {
      // Create a gauge first
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGauge88888888888888888888888888888888',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreator8888888888888888888888888888888',
        name: 'Old Gauge Name',
        description: 'Old description',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          gauge: gauge.address,
          metadataURI: 'ipfs://QmUpdated123',
        },
      } as any

      const newMetadata = {
        name: 'Updated Gauge Name',
        description: 'Updated gauge description',
        links: ['https://updated.com', 'https://forum.updated.com'],
        avatar: 'https://updated.com/new-avatar.png',
      }

      extractMetadataUriStub.returns('ipfs://QmUpdated123')
      fetchMetadataStub.resolves(newMetadata)
      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeUpdateMetadata(parsedEvent, mockInfo)

      // Verify the gauge metadata was updated
      const updatedGauge = await Models.Gauge.findOne({
        address: gauge.address,
        network: mockInfo.network,
      })

      expect(updatedGauge).to.exist
      expect(updatedGauge.name).to.equal('Updated Gauge Name')
      expect(updatedGauge.description).to.equal('Updated gauge description')
      expect(updatedGauge.links).to.deep.equal(['https://updated.com', 'https://forum.updated.com'])
      expect(updatedGauge.avatar).to.equal('https://updated.com/new-avatar.png')
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge update updated')
    })

    it('should return early if gauge not found', async () => {
      const parsedEvent = {
        args: {
          gauge: '0xNonExistentGauge3333333333333333333333',
          metadataURI: 'ipfs://QmTest',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeUpdateMetadata(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No gauge found update metadata')

      // Verify fetchMetadata was not called
      expect(fetchMetadataStub.called).to.be.false
    })

    it('should handle IPFS fetch errors during update', async () => {
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGauge99999999999999999999999999999999',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreator9999999999999999999999999999999',
        name: 'Original Name',
        description: 'Original description',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          gauge: gauge.address,
          metadataURI: 'ipfs://QmFailed',
        },
      } as any

      extractMetadataUriStub.returns('ipfs://QmFailed')
      fetchMetadataStub.rejects(new Error('IPFS error'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeUpdateMetadata(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error update gauge metadata')

      // Verify the gauge was NOT updated
      const unchangedGauge = await Models.Gauge.findOne({
        address: gauge.address,
        network: mockInfo.network,
      })

      expect(unchangedGauge).to.exist
      expect(unchangedGauge.name).to.equal('Original Name')
      expect(unchangedGauge.description).to.equal('Original description')
    })
  })

  describe('gaugeVoted', () => {
    it('should create a VoteGauge record when vote is cast', async () => {
      // Create a gauge first
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeA1111111111111111111111111111111',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorA111111111111111111111111111111',
        name: 'Voting Gauge',
        description: 'For testing votes',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter11111111111111111111111111111111111',
          gauge: gauge.address,
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(1000000000000000000),
          totalVotingPowerInGauge: BigInt(5000000000000000000),
          totalVotingPowerInContract: BigInt(10000000000000000000),
          timestamp: BigInt(1620000001),
        },
      } as any

      getBlockTimestampStub.resolves(1620000001)
      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeVoted(parsedEvent, mockInfo)

      // Verify VoteGauge was created
      const voteGauge = await Models.VoteGauge.findOne({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
        pluginAddress: mockPlugin.address,
      })

      expect(voteGauge).to.exist
      expect(voteGauge.pluginAddress).to.equal(mockPlugin.address)
      expect(voteGauge.gaugeAddress).to.equal(gauge.address)
      expect(voteGauge.memberAddress).to.equal('0xVoter11111111111111111111111111111111111')
      expect(voteGauge.epochId).to.equal('1')
      expect(voteGauge.votingPower).to.equal('1000000000000000000')
      expect(voteGauge.blockNumber).to.equal(mockInfo.blockNumber)
      expect(voteGauge.blockTimestamp).to.equal(1620000001)

      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge voted')

      // Verify GaugeMetrics.epochGaugeMetrics was called
      expect(gaugeMetricsStub.calledOnce).to.be.true
      expect(
        gaugeMetricsStub.calledWith({
          epochId: '1',
          gaugeAddress: gauge.address,
          pluginAddress: gauge.pluginAddress,
          network: gauge.network,
          currentEpochVotingPower: '5000000000000000000',
          totalGaugeVotingPower: '10000000000000000000',
        }),
      ).to.be.true
    })

    it('should return early if gauge not found', async () => {
      const parsedEvent = {
        args: {
          voter: '0xVoter22222222222222222222222222222222222',
          gauge: '0xNonExistentGauge4444444444444444444444',
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(1000),
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeVoted(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No gauge found gaugeVoted')

      // Verify no VoteGauge was created
      const voteEpochs = await Models.VoteGauge.find({
        network: mockInfo.network,
      })
      expect(voteEpochs).to.have.lengthOf(0)
    })

    it('should not create duplicate VoteGauge if already exists', async () => {
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeB2222222222222222222222222222222',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorB222222222222222222222222222222',
        name: 'Duplicate Test Gauge',
        description: 'Testing duplicates',
        isActive: true,
      })

      // Create an existing VoteGauge
      await Models.VoteGauge.create({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
        blockNumber: mockInfo.blockNumber,
        pluginAddress: mockPlugin.address,
        gaugeAddress: gauge.address,
        memberAddress: '0xVoter33333333333333333333333333333333333',
        epochId: '1',
        votingPower: '500000000000000000',
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter33333333333333333333333333333333333',
          gauge: gauge.address,
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(500000000000000000),
        },
      } as any

      await GaugeHandler.gaugeVoted(parsedEvent, mockInfo)

      // Verify only one VoteGauge exists
      const voteEpochs = await Models.VoteGauge.find({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
      })
      expect(voteEpochs).to.have.lengthOf(1)
    })

    it('should handle errors during vote creation', async () => {
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeC3333333333333333333333333333333',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorC333333333333333333333333333333',
        name: 'Error Test Gauge',
        description: 'Testing errors',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter44444444444444444444444444444444444',
          gauge: gauge.address,
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(1000),
        },
      } as any

      getBlockTimestampStub.rejects(new Error('Web3 error'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeVoted(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error gaugeVoted')
    })

    it('should handle missing plugin gracefully', async () => {
      // Create a gauge with a plugin that doesn't exist
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeD4444444444444444444444444444444',
        pluginAddress: '0xNonExistentPlugin111111111111111111111',
        creatorAddress: '0xCreatorD444444444444444444444444444444',
        name: 'No Plugin Gauge',
        description: 'Testing missing plugin',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter55555555555555555555555555555555555',
          gauge: gauge.address,
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(1000),
        },
      } as any

      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeVoted(parsedEvent, {
        ...mockInfo,
        address: '0xNonExistentPlugin111111111111111111111',
      })

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error gaugeVoted')

      // Verify no VoteGauge was created
      const voteGauge = await Models.VoteGauge.findOne({
        gaugeAddress: gauge.address,
      })
      expect(voteGauge).to.be.null
    })
  })

  describe('gaugeReset', () => {
    it('should update VoteGauge with reset transaction hash', async () => {
      // Create a gauge
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeE5555555555555555555555555555555',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorE555555555555555555555555555555',
        name: 'Reset Test Gauge',
        description: 'Testing reset',
        isActive: true,
      })

      // Create a VoteGauge to be reset
      const voteGauge = await Models.VoteGauge.create({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
        blockNumber: mockInfo.blockNumber,
        pluginAddress: mockPlugin.address,
        gaugeAddress: gauge.address,
        memberAddress: '0xVoter66666666666666666666666666666666666',
        epochId: '1',
        votingPower: '1000000000000000000',
      })

      const resetTxHash = '0xResetTransaction111111111111111111111111111111111111111111111111'
      const parsedEvent = {
        args: {
          voter: '0xVoter66666666666666666666666666666666666',
          gauge: gauge.address,
          epoch: BigInt(1),
          votingPowerRemovedFromGauge: BigInt(1000000000000000000),
          totalVotingPowerInGauge: BigInt(2000000000000000000),
          totalVotingPowerInContract: BigInt(150000000000000000000),
          timestamp: BigInt(1620000002),
        },
      } as any

      const resetInfo = {
        ...mockInfo,
        transactionHash: resetTxHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
      }

      const verboseStub = sandbox.stub(logger, 'verbose')

      await GaugeHandler.gaugeReset(parsedEvent, resetInfo)

      // Verify the VoteGauge was updated with reset transaction hash
      const updatedVoteEpoch = await Models.VoteGauge.findOne({
        id: voteGauge.id,
      })

      expect(updatedVoteEpoch).to.exist
      expect(updatedVoteEpoch.resetVoteTransactionHash).to.equal(resetTxHash)
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.args[0][0]).to.equal('Gauge reset vote')

      // Verify GaugeMetrics.epochGaugeMetrics was called
      expect(gaugeMetricsStub.calledOnce).to.be.true
      expect(
        gaugeMetricsStub.calledWith({
          epochId: '1',
          gaugeAddress: gauge.address,
          pluginAddress: gauge.pluginAddress,
          network: gauge.network,
          currentEpochVotingPower: '2000000000000000000',
          totalGaugeVotingPower: '150000000000000000000',
        }),
      ).to.be.true
    })

    it('should warn if gauge not found', async () => {
      const parsedEvent = {
        args: {
          voter: '0xVoter77777777777777777777777777777777777',
          gauge: '0xNonExistentGauge5555555555555555555555',
          epoch: BigInt(1),
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeReset(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No gauge found gaugeReset')
    })

    it('should warn if VoteGauge not found', async () => {
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeF6666666666666666666666666666666',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorF666666666666666666666666666666',
        name: 'No Vote Gauge',
        description: 'Testing no vote',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter88888888888888888888888888888888888',
          gauge: gauge.address,
          epoch: BigInt(1),
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await GaugeHandler.gaugeReset(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('No voteGauge found gaugeReset')
    })

    it('should handle errors during reset', async () => {
      const gauge = await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: '0xGaugeG7777777777777777777777777777777',
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorG777777777777777777777777777777',
        name: 'Error Reset Gauge',
        description: 'Testing reset error',
        isActive: true,
      })

      const parsedEvent = {
        args: {
          voter: '0xVoter88888888888888888888888888888888888',
          gauge: gauge.address,
          epoch: BigInt(1),
        },
      } as any

      sandbox.stub(Models.VoteGauge, 'findOne').rejects(new Error('Database error'))
      const errorStub = sandbox.stub(logger, 'error')

      await GaugeHandler.gaugeReset(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error gaugeReset')
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete gauge lifecycle: create -> activate -> vote -> reset', async () => {
      const gaugeAddress = '0xGaugeH8888888888888888888888888888888'
      const creatorAddress = '0xCreatorH888888888888888888888888888888'
      const voterAddress = '0xVoter99999999999999999999999999999999999'

      // Step 1: Create gauge
      const createEvent = {
        args: {
          gauge: gaugeAddress,
          creator: creatorAddress,
          metadataURI: 'ipfs://QmIntegration',
        },
      } as any

      extractMetadataUriStub.returns('ipfs://QmIntegration')
      fetchMetadataStub.resolves({
        name: 'Integration Test Gauge',
        description: 'Full lifecycle test',
        links: ['https://integration-test.com'],
        avatar: 'https://integration-test.com/avatar.png',
      })

      await GaugeHandler.gaugeCreated(createEvent, mockInfo)

      let gauge = await Models.Gauge.findOne({ address: gaugeAddress })
      expect(gauge).to.exist
      expect(gauge.isActive).to.be.true

      // Step 2: Deactivate gauge (to test deactivation)
      const deactivateEvent = {
        args: { gauge: gaugeAddress },
      } as any

      await GaugeHandler.gaugeDeactivated(deactivateEvent, mockInfo)

      gauge = await Models.Gauge.findOne({ address: gaugeAddress })
      expect(gauge.isActive).to.be.false

      // Step 3: Activate gauge again
      const activateEvent = {
        args: { gauge: gaugeAddress },
      } as any

      await GaugeHandler.gaugeActivated(activateEvent, mockInfo)

      gauge = await Models.Gauge.findOne({ address: gaugeAddress })
      expect(gauge.isActive).to.be.true

      // Step 3: Vote on gauge
      const voteEvent = {
        args: {
          voter: voterAddress,
          gauge: gaugeAddress,
          epoch: BigInt(1),
          votingPowerCastForGauge: BigInt(1000000000000000000),
          totalVotingPowerInGauge: BigInt(1000000000000000000),
          totalVotingPowerInContract: BigInt(5000000000000000000),
        },
      } as any

      getBlockTimestampStub.resolves(1620000002)

      const voteInfo = {
        ...mockInfo,
        transactionHash: '0xVoteTx1111111111111111111111111111111111111111111111111111111111',
        transactionIndex: 1,
        logIndex: 5,
      }

      await GaugeHandler.gaugeVoted(voteEvent, voteInfo)

      const voteGauge = await Models.VoteGauge.findOne({
        gaugeAddress,
        memberAddress: voterAddress,
      })
      expect(voteGauge).to.exist
      expect(voteGauge.votingPower).to.equal('1000000000000000000')
      expect(voteGauge.resetVoteTransactionHash).to.be.null

      // Step 4: Reset vote
      const resetEvent = {
        args: {
          voter: voterAddress,
          gauge: gaugeAddress,
          epoch: BigInt(1),
          totalVotingPowerInGauge: BigInt(500000000000000000),
          totalVotingPowerInContract: BigInt(3000000000000000000),
        },
      } as any

      const resetInfo = {
        ...voteInfo,
        transactionHash: '0xResetTx22222222222222222222222222222222222222222222222222222222',
      }

      await GaugeHandler.gaugeReset(resetEvent, resetInfo)

      const updatedVoteEpoch = await Models.VoteGauge.findOne({
        id: voteGauge.id,
      })
      expect(updatedVoteEpoch.resetVoteTransactionHash).to.equal(resetInfo.transactionHash)
    })

    it('should handle multiple votes on same gauge in same epoch', async () => {
      const gaugeAddress = '0xGaugeI9999999999999999999999999999999'

      // Create gauge
      await Models.Gauge.create({
        network: mockInfo.network,
        blockNumber: mockInfo.blockNumber,
        transactionHash: mockInfo.transactionHash,
        address: gaugeAddress,
        pluginAddress: mockPlugin.address,
        creatorAddress: '0xCreatorI999999999999999999999999999999',
        name: 'Multi-vote Gauge',
        description: 'Testing multiple votes',
        isActive: true,
      })

      const voters = [
        '0xVoterA1111111111111111111111111111111111',
        '0xVoterB2222222222222222222222222222222222',
        '0xVoterC3333333333333333333333333333333333',
      ]

      getBlockTimestampStub.resolves(1620000003)

      // Cast votes from multiple voters
      for (let i = 0; i < voters.length; i++) {
        const voteEvent = {
          args: {
            voter: voters[i],
            gauge: gaugeAddress,
            epoch: BigInt(1),
            votingPowerCastForGauge: BigInt((i + 1) * 1000000000000000000),
            totalVotingPowerInGauge: BigInt((i + 1) * 1000000000000000000),
            totalVotingPowerInContract: BigInt((i + 1) * 5000000000000000000),
          },
        } as any

        const voteInfo = {
          ...mockInfo,
          transactionHash: `0xVoteTx${i}111111111111111111111111111111111111111111111111111111`,
          transactionIndex: i,
          logIndex: i * 2,
        }

        await GaugeHandler.gaugeVoted(voteEvent, voteInfo)
      }

      // Verify all votes were created
      const voteEpochs = await Models.VoteGauge.find({
        gaugeAddress,
        epochId: '1',
      })

      expect(voteEpochs).to.have.lengthOf(3)
      expect(voteEpochs.map(v => v.memberAddress)).to.deep.equal(voters)
      expect(voteEpochs[0].votingPower).to.equal('1000000000000000000')
      expect(voteEpochs[1].votingPower).to.equal('2000000000000000000')
      expect(voteEpochs[2].votingPower).to.equal('3000000000000000000')
    })
  })
})
