import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import pluginMembersMigration from '@src/migrations/20250804122527-pluginMembers'
import { NetworksEnum, IPluginInterfaceType } from '@types'
import { MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import logger from '@logger'
import MockMultisigMember from './mockData/mockMultisigMember.json'

describe('migration: pluginMembers', () => {
  let sandbox: SinonSandbox
  let mockDaoMemberMappingCollection: any
  let mockMemberMetricsCollection: any
  let stubCreateBaseMember: SinonStub
  let stubMemberGovernanceFactoryCreate: SinonStub
  let governanceStub: any
  let stubPluginFindByAddress: SinonStub
  let stubPluginMemberCreate: SinonStub
  let stubLoggerInfo: SinonStub
  let stubLoggerError: SinonStub
  let stubLoggerWarn: SinonStub

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

    // Stub MemberGovernanceFactory methods
    stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

    // Create governance stub with required methods
    governanceStub = {
      updatePluginMetrics: sandbox.stub().resolves(),
    }

    stubMemberGovernanceFactoryCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceStub)

    // Stub Plugin model
    stubPluginFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress')

    // Stub PluginMember model
    stubPluginMemberCreate = sandbox.stub(Models.PluginMember, 'create').resolves()

    // Stub logger methods
    stubLoggerInfo = sandbox.stub(logger, 'info')
    stubLoggerError = sandbox.stub(logger, 'error')
    stubLoggerWarn = sandbox.stub(logger, 'warn')
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

      // Set up plugin mocks - plugins without tokenAddress (non-token plugins)
      const mockPlugin1 = {
        address: mockDaoMemberMappings[0].pluginAddress,
        daoAddress: mockDaoMemberMappings[0].daoAddress,
        network: mockDaoMemberMappings[0].network,
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.multisig,
      }
      const mockPlugin2 = {
        address: mockDaoMemberMappings[1].pluginAddress,
        daoAddress: mockDaoMemberMappings[1].daoAddress,
        network: mockDaoMemberMappings[1].network,
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.admin,
      }

      stubPluginFindByAddress
        .withArgs(mockDaoMemberMappings[0].pluginAddress, mockDaoMemberMappings[0].network)
        .resolves(mockPlugin1)
      stubPluginFindByAddress
        .withArgs(mockDaoMemberMappings[1].pluginAddress, mockDaoMemberMappings[1].network)
        .resolves(mockPlugin2)

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

      // Verify MemberGovernanceFactory calls for first document
      expect(stubCreateBaseMember.calledWith(mockDaoMemberMappings[0].memberAddress)).to.be.true
      expect(
        stubPluginMemberCreate.calledWith({
          memberAddress: mockDaoMemberMappings[0].memberAddress,
          daoAddress: mockDaoMemberMappings[0].daoAddress,
          pluginAddress: mockDaoMemberMappings[0].pluginAddress,
          network: mockDaoMemberMappings[0].network,
        }),
      ).to.be.true
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockDaoMemberMappings[0].memberAddress,
          pluginAddress: mockDaoMemberMappings[0].pluginAddress,
          network: mockDaoMemberMappings[0].network,
          daoAddress: mockDaoMemberMappings[0].daoAddress,
          lastActivity: mockMemberMetrics.lastActivity,
        }),
      ).to.be.true

      // Verify MemberGovernanceFactory calls for second document (without metrics)
      expect(stubCreateBaseMember.calledWith(mockDaoMemberMappings[1].memberAddress)).to.be.true
      expect(
        stubPluginMemberCreate.calledWith({
          memberAddress: mockDaoMemberMappings[1].memberAddress,
          daoAddress: mockDaoMemberMappings[1].daoAddress,
          pluginAddress: mockDaoMemberMappings[1].pluginAddress,
          network: mockDaoMemberMappings[1].network,
        }),
      ).to.be.true
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockDaoMemberMappings[1].memberAddress,
          pluginAddress: mockDaoMemberMappings[1].pluginAddress,
          network: mockDaoMemberMappings[1].network,
          daoAddress: mockDaoMemberMappings[1].daoAddress,
          lastActivity: undefined,
        }),
      ).to.be.true

      // Verify total calls
      expect(stubCreateBaseMember.callCount).to.equal(2)
      expect(stubPluginMemberCreate.callCount).to.equal(2)
      expect(governanceStub.updatePluginMetrics.callCount).to.equal(2)

      // Verify logging
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle no documents to migrate', async () => {
      mockDaoMemberMappingCollection.toArray.resolves([])

      await pluginMembersMigration.start()

      expect(mockDaoMemberMappingCollection.find.calledWith({ tokenAddress: null })).to.be.true
      expect(stubCreateBaseMember.called).to.be.false
      expect(stubPluginMemberCreate.called).to.be.false
      expect(governanceStub.updatePluginMetrics.called).to.be.false
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

      // Set up plugin mocks
      const mockPlugin = {
        address: mockDaoMemberMappings[1].pluginAddress,
        daoAddress: mockDaoMemberMappings[1].daoAddress,
        network: mockDaoMemberMappings[1].network,
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.multisig,
      }

      // First plugin call fails, second succeeds
      stubPluginFindByAddress
        .withArgs(mockDaoMemberMappings[0].pluginAddress, mockDaoMemberMappings[0].network)
        .resolves(null) // Plugin not found - will be skipped
      stubPluginFindByAddress
        .withArgs(mockDaoMemberMappings[1].pluginAddress, mockDaoMemberMappings[1].network)
        .resolves(mockPlugin)

      mockDaoMemberMappingCollection.toArray.resolves(mockDaoMemberMappings)
      mockMemberMetricsCollection.findOne.resolves(null)

      // Make first createBaseMember call fail
      stubCreateBaseMember.onFirstCall().rejects(new Error('Test error')).onSecondCall().resolves()

      await pluginMembersMigration.start()

      // Verify error handling
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.equal('Error processing daoMemberMapping document')

      // Verify second document was still processed
      expect(stubCreateBaseMember.callCount).to.equal(2)
      expect(stubPluginMemberCreate.callCount).to.equal(1) // Only successful one
      expect(governanceStub.updatePluginMetrics.callCount).to.equal(1) // Only successful one

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

      // Set up plugin mocks for all 150 documents
      const mockPlugin = {
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.multisig,
      }
      stubPluginFindByAddress.resolves(mockPlugin)

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
    })
  })

  describe('should create the users and all the related tables without any stub', () => {
    it('should utilize the mock data to run the migration', async () => {
      sandbox.restore()
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'verbose')

      await mongoose.connection.collection('DaoMemberMapping').insertMany(MockMultisigMember.memberMappings)
      await mongoose.connection.collection('MemberMetric').insertMany(MockMultisigMember.memberMetrics)
      await Models.Plugin.insertMany(MockMultisigMember.plugins)
      await Models.Dao.create(MockMultisigMember.dao)

      await pluginMembersMigration.start()

      const members = await Models.PluginMember.find({
        pluginAddress: MockMultisigMember.memberMappings[0].pluginAddress,
      })

      const pluginMetrics = await Models.PluginMetrics.find({
        pluginAddress: MockMultisigMember.memberMappings[0].pluginAddress,
      })

      const totalMembers = await Models.Dao.countUniqueMembers(
        MockMultisigMember.dao.address,
        MockMultisigMember.dao.network,
      )

      expect(totalMembers).to.be.eq(members.length)

      expect(members.length).to.equal(pluginMetrics.length)
      expect(pluginMetrics[0].lastActivity).to.be.not.eq(0)
      expect(pluginMetrics[0].firstActivity).to.be.not.eq(0)
    })
  })
})
