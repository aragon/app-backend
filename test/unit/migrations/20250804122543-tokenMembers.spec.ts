import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import tokenMembersMigration from '@src/migrations/20250804122543-tokenMembers'
import { IPluginStatus, NetworksEnum } from '@types'
import { MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import logger from '@logger'

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

  describe('check why we did not have the proper data', () => {
    it('should simulate complete migration with mock data arrays', async () => {
      sandbox.restore()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      const dao = {
        id: 'ethereum-mainnet-0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
        isActive: true,
        isHidden: false,
        network: 'ethereum-mainnet',
        transactionHash: '0xd32af2ec5b10c0e131639a9c90340e69a15e925b4f593855e18d93c35fa7d240',
        blockNumber: 19847203,
        blockTimestamp: 1715435495,
        address: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
        implementationAddress: '0x52Af16664155608b845BE18aa29620EbF6eA2D3a',
        creatorAddress: '0xe5818d70a9b5aed2bfDe4E41FBcB07dD80f8fC84',
        ens: 'spinnakerspin.dao.eth',
        subdomain: 'spinnakerspin',
        metadataIpfs: 'ipfs://QmUBaCEMvbSBC4umuYTYNRFnq2uz7VRfrn2wJckLExSnjZ',
        name: 'SpinnakerSpinStrategy',
        description: 'Spinnaker SPIN strategy for managing assets in DeFi with moderate risk exposure',
        avatar: 'ipfs://Qmdtyq89Q6hsw2TCfZyvRW7Kr8xWQhS4fXbupo5SsDLASW',
        version: '1.3.0',
        metrics: {
          tvlUSD: 514947.23,
          proposalsCreated: 7,
          proposalsExecuted: 7,
          uniqueVoters: 1,
          votes: 7,
          members: 0,
        },
        links: [
          {
            name: 'Website',
            url: 'http://spinnakerdao.io',
          },
        ],
      }

      await Models.Dao.create(dao)

      const plugin = {
        id: 'ethereum-mainnet-0xd32af2ec5b10c0e131639a9c90340e69a15e925b4f593855e18d93c35fa7d240-0xD7CeEEFE65a9154864f881ACa5C015ac7787EeD7',
        transactionHash: '0xd32af2ec5b10c0e131639a9c90340e69a15e925b4f593855e18d93c35fa7d240',
        blockNumber: 19847203,
        blockTimestamp: 1715435495,
        network: 'ethereum-mainnet',
        address: '0xD7CeEEFE65a9154864f881ACa5C015ac7787EeD7',
        implementationAddress: '0xd4bfb6C688b2982A3b432F2Fc6C35117532A2C27',
        interfaceType: 'tokenVoting',
        status: 'installed',
        isSupported: true,
        daoAddress: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
        tokenAddress: '0x2DdA5c2e0665B1719Be03DCBbECED9F4d8bb7735',
        pluginSetupRepoAddress: '0xb7401cD221ceAFC54093168B814Cc3d42579287f',
        sender: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        release: '1',
        build: '2',
        subdomain: 'token-voting',
        permissions: [
          {
            operation: 0,
            where: '0xD7CeEEFE65a9154864f881ACa5C015ac7787EeD7',
            who: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: '0xbba35d41610b7d25c8e486006535c76bd423091563e694d206ae3d71ce949fe5',
          },
          {
            operation: 0,
            where: '0xD7CeEEFE65a9154864f881ACa5C015ac7787EeD7',
            who: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: '0x821b6e3a557148015a918c89e5d092e878a69854a2d1a410635f771bd5a8a3f5',
          },
          {
            operation: 0,
            where: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
            who: '0xD7CeEEFE65a9154864f881ACa5C015ac7787EeD7',
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: '0xbf04b4486c9663d805744005c3da000eda93de6e3308a4a7a812eb565327b78d',
          },
          {
            operation: 0,
            where: '0x2DdA5c2e0665B1719Be03DCBbECED9F4d8bb7735',
            who: '0xFF4e2F08911F0082e7446D377eaFfEE98B7d45a6',
            condition: '0x0000000000000000000000000000000000000000',
            permissionId: '0xb737b436e6cc542520cb79ec04245c720c38eebfa56d9e2d99b043979db20e4c',
          },
        ],
        uninstalled: {
          status: false,
          transactionHash: null,
          blockNumber: null,
          blockTimestamp: null,
        },
        isProcess: true,
        isBody: true,
        isSubPlugin: false,
        metadataIpfs: null,
        name: null,
        description: null,
        processKey: null,
        subPlugins: [],
        links: [],
      }

      // Load mock data arrays
      const mockMemberBalanceData = await import('./mockData/mockMemberBalance.json')
      const mockMemberMetricsData = await import('./mockData/mockMemberMetrics.json')
      const mockMemberTransactionData = await import('./mockData/mockMemberTransaction.json')

      await Models.Plugin.create(plugin)
      await mongoose.connection
        .collection('MemberBalance')
        .insertMany(mockMemberBalanceData.default || mockMemberBalanceData)
      await mongoose.connection
        .collection('MemberMetric')
        .insertMany(mockMemberMetricsData.default || mockMemberMetricsData)
      await mongoose.connection
        .collection('MemberTransaction')
        .insertMany(mockMemberTransactionData.default || mockMemberTransactionData)

      await tokenMembersMigration.start()

      const membersWeSave = await Models.TokenMember.find({})
      const pluginMetrics = await Models.PluginMetrics.find({})

      expect(membersWeSave.length).to.be.eq(pluginMetrics.length)

      const totalMembers = await Models.Dao.countUniqueMembersCount(dao.address, dao.network)

      expect(totalMembers).to.be.eq(membersWeSave.length)
    })
  })
})
