import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import pluginMembersMigration from '@src/migrations/20250804122527-pluginMembers'
import { NetworksEnum } from '@types'
import { ProxyMember } from '@modules/proxyMember'
import logger from '@logger'

describe('migration: pluginMembers', () => {
  let sandbox: SinonSandbox
  let mockDaoMemberMappingCollection: any
  let mockMemberMetricsCollection: any
  let stubProxyMemberCreateMember: SinonStub
  let stubProxyMemberAddPluginMember: SinonStub
  let stubProxyMemberUpdatePluginMetrics: SinonStub
  let stubLoggerInfo: SinonStub
  let stubLoggerError: SinonStub
  let stubLoggerVerbose: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Mock collections
    mockDaoMemberMappingCollection = {
      find: sandbox.stub().returnsThis(),
      toArray: sandbox.stub(),
    }

    mockMemberMetricsCollection = {
      findOne: sandbox.stub(),
    }

    // Stub mongoose connection
    sandbox
      .stub(mongoose.connection, 'collection')
      .withArgs('DaoMemberMapping')
      .returns(mockDaoMemberMappingCollection)
      .withArgs('MemberMetric')
      .returns(mockMemberMetricsCollection)

    // Stub ProxyMember methods
    stubProxyMemberCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
    stubProxyMemberAddPluginMember = sandbox.stub(ProxyMember, 'addPluginMember').resolves()
    stubProxyMemberUpdatePluginMetrics = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()

    // Stub logger methods
    stubLoggerInfo = sandbox.stub(logger, 'info')
    stubLoggerError = sandbox.stub(logger, 'error')
    stubLoggerVerbose = sandbox.stub(logger, 'verbose')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('pluginMembersMigration', () => {
    it('should successfully migrate daoMemberMapping documents with null tokenAddress', async () => {
      const mockDaoMemberMappings = [
        {
          memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
          daoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x567890abcdef1234567890abcdef1234567890ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null,
        },
        {
          memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
          daoAddress: '0xbbcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x667890abcdef1234567890abcdef1234567890ab',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: null,
        },
      ]

      const mockMemberMetrics = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        pluginAddress: '0x567890abcdef1234567890abcdef1234567890ab',
        voteCount: 5,
        proposalCount: 2,
        firstActivity: 1234567890,
        lastActivity: 1234567899,
      }

      mockDaoMemberMappingCollection.toArray.resolves(mockDaoMemberMappings)
      mockMemberMetricsCollection.findOne
        .withArgs({
          address: mockDaoMemberMappings[0].memberAddress,
          pluginAddress: mockDaoMemberMappings[0].pluginAddress,
        })
        .resolves(mockMemberMetrics)
      mockMemberMetricsCollection.findOne
        .withArgs({
          address: mockDaoMemberMappings[1].memberAddress,
          pluginAddress: mockDaoMemberMappings[1].pluginAddress,
        })
        .resolves(null)

      await pluginMembersMigration.start()

      // Verify queries
      expect(mockDaoMemberMappingCollection.find.calledWith({ tokenAddress: null })).to.be.true
      expect(mockDaoMemberMappingCollection.toArray.calledOnce).to.be.true

      // Verify ProxyMember calls for first document
      expect(stubProxyMemberCreateMember.calledWith(mockDaoMemberMappings[0].memberAddress)).to.be.true
      expect(
        stubProxyMemberAddPluginMember.calledWith({
          memberAddress: mockDaoMemberMappings[0].memberAddress,
          daoAddress: mockDaoMemberMappings[0].daoAddress,
          pluginAddress: mockDaoMemberMappings[0].pluginAddress,
          network: mockDaoMemberMappings[0].network,
        }),
      ).to.be.true
      expect(
        stubProxyMemberUpdatePluginMetrics.calledWith({
          memberAddress: mockDaoMemberMappings[0].memberAddress,
          pluginAddress: mockDaoMemberMappings[0].pluginAddress,
          network: mockDaoMemberMappings[0].network,
          daoAddress: mockDaoMemberMappings[0].daoAddress,
          lastActivity: mockMemberMetrics.lastActivity,
        }),
      ).to.be.true

      // Verify ProxyMember calls for second document (without metrics)
      expect(stubProxyMemberCreateMember.calledWith(mockDaoMemberMappings[1].memberAddress)).to.be.true
      expect(
        stubProxyMemberAddPluginMember.calledWith({
          memberAddress: mockDaoMemberMappings[1].memberAddress,
          daoAddress: mockDaoMemberMappings[1].daoAddress,
          pluginAddress: mockDaoMemberMappings[1].pluginAddress,
          network: mockDaoMemberMappings[1].network,
        }),
      ).to.be.true
      expect(
        stubProxyMemberUpdatePluginMetrics.calledWith({
          memberAddress: mockDaoMemberMappings[1].memberAddress,
          pluginAddress: mockDaoMemberMappings[1].pluginAddress,
          network: mockDaoMemberMappings[1].network,
          daoAddress: mockDaoMemberMappings[1].daoAddress,
          lastActivity: undefined,
        }),
      ).to.be.true

      // Verify total calls
      expect(stubProxyMemberCreateMember.callCount).to.equal(2)
      expect(stubProxyMemberAddPluginMember.callCount).to.equal(2)
      expect(stubProxyMemberUpdatePluginMetrics.callCount).to.equal(2)

      // Verify logging
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle no documents to migrate', async () => {
      mockDaoMemberMappingCollection.toArray.resolves([])

      await pluginMembersMigration.start()

      expect(mockDaoMemberMappingCollection.find.calledWith({ tokenAddress: null })).to.be.true
      expect(stubProxyMemberCreateMember.called).to.be.false
      expect(stubProxyMemberAddPluginMember.called).to.be.false
      expect(stubProxyMemberUpdatePluginMetrics.called).to.be.false
      expect(stubLoggerInfo.calledWith('No daoMemberMapping documents to migrate')).to.be.true
    })

    it('should handle errors and continue processing', async () => {
      const mockDaoMemberMappings = [
        {
          memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
          daoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x567890abcdef1234567890abcdef1234567890ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null,
        },
        {
          memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
          daoAddress: '0xbbcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x667890abcdef1234567890abcdef1234567890ab',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: null,
        },
      ]

      mockDaoMemberMappingCollection.toArray.resolves(mockDaoMemberMappings)
      mockMemberMetricsCollection.findOne.resolves(null)

      // Make first ProxyMember call fail
      stubProxyMemberCreateMember.onFirstCall().rejects(new Error('Test error')).onSecondCall().resolves()

      await pluginMembersMigration.start()

      // Verify error handling
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.equal('Error processing daoMemberMapping document')

      // Verify second document was still processed
      expect(stubProxyMemberCreateMember.callCount).to.equal(2)
      expect(stubProxyMemberAddPluginMember.callCount).to.equal(1) // Only successful one
      expect(stubProxyMemberUpdatePluginMetrics.callCount).to.equal(1) // Only successful one

      // Verify completion with error count
      const completionLogCall = stubLoggerInfo
        .getCalls()
        .find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
      expect(completionLogCall?.args[1].errors).to.equal(1)
      expect(completionLogCall?.args[1].totalProcessed).to.equal(1)
    })

    it('should log progress every 100 documents', async () => {
      // Create 150 mock documents
      const mockDaoMemberMappings = Array.from({ length: 150 }, (_, i) => ({
        memberAddress: `0x${i.toString(16).padStart(40, '0')}`,
        daoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        pluginAddress: '0x567890abcdef1234567890abcdef1234567890ab',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: null,
      }))

      mockDaoMemberMappingCollection.toArray.resolves(mockDaoMemberMappings)
      mockMemberMetricsCollection.findOne.resolves(null)

      await pluginMembersMigration.start()

      // Check for progress log at 100 documents
      const progressLogCalls = stubLoggerInfo.getCalls().filter(call => call.args[0] === 'Migration progress')
      expect(progressLogCalls.length).to.be.at.least(1)
      expect(progressLogCalls[0].args[1].processed).to.equal(100)
      expect(progressLogCalls[0].args[1].percentage).to.equal('66.67')
    })

    it('should handle migration failure', async () => {
      const error = new Error('Database connection failed')
      mockDaoMemberMappingCollection.toArray.rejects(error)

      await expect(pluginMembersMigration.start()).to.be.rejectedWith('Database connection failed')

      expect(stubLoggerError.calledWith('Migration failed')).to.be.true
      expect(stubLoggerError.firstCall.args[1].error).to.equal(error)
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await pluginMembersMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })
})
