import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import tokenMembersMigration from '@src/migrations/20250804122543-tokenMembers'
import { IPluginStatus, NetworksEnum } from '@types'
import { MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import logger from '@logger'
import MockTokenVotingData from './mockData/mockTokenVoting.json'

describe('migration: tokenMembers', () => {
  let sandbox: SinonSandbox
  let mockMemberBalancesCollection: any
  let mockMemberMetricsCollection: any
  let mockMemberTransactionsCollection: any
  let stubCreateBaseMember: SinonStub
  let stubMemberGovernanceFactoryCreate: SinonStub
  let governanceStub: any
  let stubPluginFind: SinonStub
  let stubLoggerInfo: SinonStub
  let stubLoggerError: SinonStub
  let stubLoggerWarn: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Mock collections
    mockMemberBalancesCollection = {
      find: sandbox.stub().returnsThis(),
      toArray: sandbox.stub(),
    }

    mockMemberMetricsCollection = {
      findOne: sandbox.stub(),
    }

    mockMemberTransactionsCollection = {
      findOne: sandbox.stub().resolves(null),
    }

    // Stub mongoose connection
    sandbox
      .stub(mongoose.connection, 'collection')
      .withArgs('MemberBalance')
      .returns(mockMemberBalancesCollection)
      .withArgs('MemberMetric')
      .returns(mockMemberMetricsCollection)
      .withArgs('MemberTransaction')
      .returns(mockMemberTransactionsCollection)

    // Stub MemberGovernanceFactory methods
    stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

    // Create governance stub with required methods
    governanceStub = {
      update: sandbox.stub().resolves(),
      updatePluginMetrics: sandbox.stub().resolves({
        firstActivity: undefined,
        update: sandbox.stub().resolves(),
      }),
    }

    stubMemberGovernanceFactoryCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceStub)

    // Stub Plugin model
    stubPluginFind = sandbox.stub(Models.Plugin, 'find')

    // Stub logger methods
    stubLoggerInfo = sandbox.stub(logger, 'info')
    stubLoggerError = sandbox.stub(logger, 'error')
    stubLoggerWarn = sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('tokenMembersMigration', () => {
    it('should successfully migrate MemberBalance documents with votingPower !== "0" and tokenAddress exists', async () => {
      const mockMemberBalances = [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000', // 1 token
        },
        {
          address: '0x2234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          network: NetworksEnum.polygonMainnet,
          votingPower: '500000000000000000', // 0.5 token
        },
      ]

      const mockPlugins = [
        {
          address: '0xplugin1234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          isSupported: true,
          status: IPluginStatus.installed,
        },
        {
          address: '0xplugin2234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao2234567890abcdef1234567890abcdef1234',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          isSupported: true,
          status: IPluginStatus.installed,
        },
      ]

      const mockMemberMetrics = {
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
        voteCount: 5,
        proposalCount: 2,
        firstActivity: 1234567890,
        lastActivity: 1234567899,
      }

      mockMemberBalancesCollection.toArray.resolves(mockMemberBalances)

      // Setup Plugin.find stubs
      stubPluginFind
        .withArgs({
          tokenAddress: mockMemberBalances[0].tokenAddress,
          network: mockMemberBalances[0].network,
          isSupported: true,
          status: IPluginStatus.installed,
        })
        .returns({ lean: () => Promise.resolve(mockPlugins) })
      stubPluginFind
        .withArgs({
          tokenAddress: mockMemberBalances[1].tokenAddress,
          network: mockMemberBalances[1].network,
          isSupported: true,
          status: IPluginStatus.installed,
        })
        .returns({ lean: () => Promise.resolve([]) })

      mockMemberMetricsCollection.findOne
        .withArgs({
          tokenAddress: mockMemberBalances[0].tokenAddress,
          memberAddress: mockMemberBalances[0].address,
          network: mockMemberBalances[0].network,
        })
        .resolves(mockMemberMetrics)
      mockMemberMetricsCollection.findOne
        .withArgs({
          tokenAddress: mockMemberBalances[1].tokenAddress,
          memberAddress: mockMemberBalances[1].address,
          network: mockMemberBalances[1].network,
        })
        .resolves(null)

      await tokenMembersMigration.start()

      // Verify queries
      expect(
        mockMemberBalancesCollection.find.calledWith({
          votingPower: { $ne: '0' },
          tokenAddress: { $exists: true, $ne: null },
        }),
      ).to.be.true
      expect(mockMemberBalancesCollection.toArray.calledOnce).to.be.true

      // Verify MemberGovernanceFactory.createBaseMember calls
      expect(
        stubCreateBaseMember.calledWith(
          mockMemberBalances[0].address,
          undefined, // lastSyncVotingPowerBlockNumber is undefined in mock data
        ),
      ).to.be.true
      expect(stubCreateBaseMember.calledWith(mockMemberBalances[1].address, undefined)).to.be.true

      // Verify governance.update calls
      expect(
        governanceStub.update.calledWith(mockMemberBalances[0].address, {
          votingPower: mockMemberBalances[0].votingPower,
          lastActivity: undefined,
        }),
      ).to.be.true
      expect(
        governanceStub.update.calledWith(mockMemberBalances[1].address, {
          votingPower: mockMemberBalances[1].votingPower,
          lastActivity: undefined,
        }),
      ).to.be.true

      // Verify governance.updatePluginMetrics calls for each plugin
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockMemberBalances[0].address,
          pluginAddress: mockPlugins[0].address,
          network: mockPlugins[0].network,
          daoAddress: mockPlugins[0].daoAddress,
          lastActivity: mockMemberMetrics.lastActivity,
        }),
      ).to.be.true
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockMemberBalances[0].address,
          pluginAddress: mockPlugins[1].address,
          network: mockPlugins[1].network,
          daoAddress: mockPlugins[1].daoAddress,
          lastActivity: mockMemberMetrics.lastActivity,
        }),
      ).to.be.true

      // Verify total calls
      expect(stubCreateBaseMember.callCount).to.equal(2)
      expect(governanceStub.update.callCount).to.equal(2)
      expect(governanceStub.updatePluginMetrics.callCount).to.equal(2) // 2 plugins for first member, 0 for second

      // Verify logging
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle no documents to migrate', async () => {
      mockMemberBalancesCollection.toArray.resolves([])

      await tokenMembersMigration.start()

      expect(
        mockMemberBalancesCollection.find.calledWith({
          votingPower: { $ne: '0' },
          tokenAddress: { $exists: true, $ne: null },
        }),
      ).to.be.true
      expect(stubCreateBaseMember.called).to.be.false
      expect(governanceStub.update.called).to.be.false
      expect(governanceStub.updatePluginMetrics.called).to.be.false
      expect(stubLoggerInfo.calledWith('No MemberBalance documents to migrate')).to.be.true
    })

    it('should handle errors and continue processing', async () => {
      const mockMemberBalances = [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
        },
        {
          address: '0x2234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          network: NetworksEnum.polygonMainnet,
          votingPower: '500000000000000000',
        },
      ]

      mockMemberBalancesCollection.toArray.resolves(mockMemberBalances)
      mockMemberMetricsCollection.findOne.resolves(null)

      // Make first createBaseMember call fail
      stubCreateBaseMember.onFirstCall().rejects(new Error('Test error')).onSecondCall().resolves()

      stubPluginFind.returns({ lean: () => Promise.resolve([]) })

      await tokenMembersMigration.start()

      // Verify error handling
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.equal('Error processing MemberBalance document')

      // Verify second document was still processed
      expect(stubCreateBaseMember.callCount).to.equal(2)

      // Verify completion with error count
      const completionLogCall = stubLoggerInfo
        .getCalls()
        .find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
      expect(completionLogCall!.args[1].errors).to.equal(1)
      expect(completionLogCall!.args[1].totalProcessed).to.equal(1)
    })

    it('should handle member with no metrics correctly', async () => {
      const mockMemberBalances = [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
        },
      ]

      const mockPlugins = [
        {
          address: '0xplugin1234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          isSupported: true,
          status: IPluginStatus.installed,
        },
      ]

      mockMemberBalancesCollection.toArray.resolves(mockMemberBalances)
      stubPluginFind.returns({ lean: () => Promise.resolve(mockPlugins) })
      mockMemberMetricsCollection.findOne.resolves(null)

      await tokenMembersMigration.start()

      // Verify updatePluginMetrics was called with default values
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockMemberBalances[0].address,
          pluginAddress: mockPlugins[0].address,
          network: mockPlugins[0].network,
          daoAddress: mockPlugins[0].daoAddress,
          lastActivity: undefined,
        }),
      ).to.be.true
    })

    it('should skip members with voting power mismatch', async () => {
      const mockMemberBalances = [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
        },
        {
          address: '0x2234567890abcdef1234567890abcdef12345678',
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          network: NetworksEnum.polygonMainnet,
          votingPower: '500000000000000000',
        },
      ]

      const mockMemberTransaction = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        memberVotingPower: '2000000000000000000', // Different voting power
        blockNumber: 1234567,
      }

      mockMemberBalancesCollection.toArray.resolves(mockMemberBalances)

      // Setup memberTransaction mocks
      mockMemberTransactionsCollection.findOne
        .onFirstCall()
        .resolves(mockMemberTransaction)
        .onSecondCall()
        .resolves(null)

      stubPluginFind.returns({ lean: () => Promise.resolve([]) })
      mockMemberMetricsCollection.findOne.resolves(null)

      await tokenMembersMigration.start()

      // Verify warning was logged
      expect(stubLoggerWarn.calledWith('Voting power mismatch detected')).to.be.true
      expect(stubLoggerWarn.firstCall.args[1].memberBalanceVP).to.equal('1000000000000000000')
      expect(stubLoggerWarn.firstCall.args[1].memberTransactionVP).to.equal('2000000000000000000')

      // Verify only second member was processed
      expect(stubCreateBaseMember.callCount).to.equal(1)
      expect(stubCreateBaseMember.calledWith(mockMemberBalances[1].address, undefined)).to.be.true
      expect(
        governanceStub.update.calledWith(mockMemberBalances[1].address, {
          votingPower: mockMemberBalances[1].votingPower,
          lastActivity: undefined,
        }),
      ).to.be.true

      // Verify completion log shows skipped count
      const completionLogCall = stubLoggerInfo
        .getCalls()
        .find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
      expect(completionLogCall!.args[1].skipped).to.equal(1)
      expect(completionLogCall!.args[1].totalProcessed).to.equal(1)
    })

    it('should log progress every 100 documents', async () => {
      // Create 150 mock documents
      const mockMemberBalances = Array.from({ length: 150 }, (_, i) => ({
        address: `0x${i.toString(16).padStart(40, '0')}`,
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        votingPower: '1000000000000000000',
      }))

      mockMemberBalancesCollection.toArray.resolves(mockMemberBalances)
      mockMemberMetricsCollection.findOne.resolves(null)
      stubPluginFind.returns({ lean: () => Promise.resolve([]) })

      await tokenMembersMigration.start()

      // Check for progress log at 100 documents
      const progressLogCalls = stubLoggerInfo.getCalls().filter(call => call.args[0] === 'Migration progress')
      expect(progressLogCalls.length).to.be.at.least(1)
      expect(progressLogCalls[0].args[1].processed).to.equal(100)
      expect(progressLogCalls[0].args[1].percentage).to.equal('66.67')
    })

    it('should handle migration failure', async () => {
      const error = new Error('Database connection failed')
      mockMemberBalancesCollection.toArray.rejects(error)

      await expect(tokenMembersMigration.start()).to.be.rejectedWith('Database connection failed')

      expect(stubLoggerError.calledWith('Migration failed')).to.be.true
      expect(stubLoggerError.firstCall.args[1].error).to.equal(error)
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await tokenMembersMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })

  describe('should insure all the data after the migration ', () => {
    it('should simulate complete migration with mock data arrays', async () => {
      sandbox.restore()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')

      await Models.Dao.create(MockTokenVotingData.dao)

      await Models.Plugin.insertMany(MockTokenVotingData.plugins)
      await mongoose.connection.collection('MemberBalance').insertMany(MockTokenVotingData.memberBalance)
      await mongoose.connection.collection('MemberMetric').insertMany(MockTokenVotingData.memberMetrics)
      await mongoose.connection.collection('MemberTransaction').insertMany(MockTokenVotingData.memberTransaction)

      await tokenMembersMigration.start()

      const membersWeSave = await Models.TokenMember.find({})
      const pluginMetrics = await Models.PluginMetrics.find({})

      expect(membersWeSave.length).to.be.eq(pluginMetrics.length)

      const totalMembers = await Models.Dao.countUniqueMembers(
        MockTokenVotingData.dao.address,
        MockTokenVotingData.dao.network,
      )

      expect(totalMembers).to.be.eq(membersWeSave.length)

      expect(pluginMetrics[0].firstActivity).to.be.not.eq(0)
      expect(pluginMetrics[0].lastActivity).to.be.not.eq(0)
    })
  })
})
