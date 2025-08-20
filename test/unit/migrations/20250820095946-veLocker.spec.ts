import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import veLockerMigration from '@src/migrations/20250820095946-veLocker'
import { IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
import { MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import logger from '@logger'
import MockVeLockerData from './mockData/mockVeLocker.json'

describe('migration: veLocker', () => {
  let sandbox: SinonSandbox
  let mockMemberBalanceCollection: any
  let stubLockAggregate: SinonStub
  let stubPluginFind: SinonStub
  let stubMemberGovernanceFactoryCreate: SinonStub
  let governanceStub: any
  let stubLoggerInfo: SinonStub
  let stubLoggerError: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Mock collections
    mockMemberBalanceCollection = {
      findOne: sandbox.stub(),
    }

    // Stub mongoose connection
    sandbox.stub(mongoose.connection, 'collection').withArgs('MemberBalance').returns(mockMemberBalanceCollection)

    // Stub Lock model aggregate
    stubLockAggregate = sandbox.stub(Models.Lock, 'aggregate')

    // Stub Plugin model
    stubPluginFind = sandbox.stub(Models.Plugin, 'find')

    // Create governance stub with required methods
    governanceStub = {
      update: sandbox.stub().resolves(),
      updatePluginMetrics: sandbox.stub().resolves(),
    }

    stubMemberGovernanceFactoryCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(governanceStub)

    // Stub logger methods
    stubLoggerInfo = sandbox.stub(logger, 'info')
    stubLoggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('veLockerMigration', () => {
    it('should successfully migrate Lock documents to lockToVoteMember governance', async () => {
      const mockVeTokens = [
        {
          _id: '0xtoken1234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
              tokenId: '1',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
            {
              memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
              tokenId: '2',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
          ],
        },
        {
          _id: '0xtoken2234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x3234567890abcdef1234567890abcdef12345678',
              tokenId: '3',
              escrowAddress: '0xescrow2234567890abcdef1234567890abcdef12',
              network: NetworksEnum.polygonMainnet,
            },
          ],
        },
      ]

      const mockMemberBalance1 = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        tokenIds: ['1', '4'],
        lastSyncAmountBlockNumber: 12345678,
      }

      const mockMemberBalance2 = {
        address: '0x2234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        tokenIds: ['2'],
        lastSyncAmountBlockNumber: 12345679,
      }

      const mockMemberBalance3 = {
        address: '0x3234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
        network: NetworksEnum.polygonMainnet,
        tokenIds: ['3'],
        lastSyncAmountBlockNumber: 12345680,
      }

      const mockPlugins1 = [
        {
          address: '0xplugin1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
        },
      ]

      const mockPlugins2 = [
        {
          address: '0xplugin2234567890abcdef1234567890abcdef12',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao2234567890abcdef1234567890abcdef1234',
        },
      ]

      // Setup Lock.aggregate stub
      stubLockAggregate.resolves(mockVeTokens)

      // Setup MemberBalance collection stubs
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['1'] },
        })
        .resolves(mockMemberBalance1)
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['2'] },
        })
        .resolves(mockMemberBalance2)
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[1].tokenAddress,
          tokenIds: { $in: ['3'] },
        })
        .resolves(mockMemberBalance3)

      // Setup Plugin.find stubs
      stubPluginFind
        .withArgs({
          network: mockMemberBalance1.network,
          tokenAddress: mockMemberBalance1.tokenAddress,
        })
        .resolves(mockPlugins1)
      stubPluginFind
        .withArgs({
          network: mockMemberBalance2.network,
          tokenAddress: mockMemberBalance2.tokenAddress,
        })
        .resolves(mockPlugins1)
      stubPluginFind
        .withArgs({
          network: mockMemberBalance3.network,
          tokenAddress: mockMemberBalance3.tokenAddress,
        })
        .resolves(mockPlugins2)

      await veLockerMigration.start()

      // Verify Lock.aggregate was called
      expect(stubLockAggregate.calledOnce).to.be.true
      expect(
        stubLockAggregate.calledWith([
          {
            $group: {
              _id: '$tokenAddress',
              users: {
                $push: {
                  memberAddress: '$memberAddress',
                  tokenId: '$tokenId',
                  escrowAddress: '$escrowAddress',
                  network: '$network',
                },
              },
            },
          },
          {
            $project: {
              tokenAddress: '$_id',
              users: '$users',
            },
          },
        ]),
      ).to.be.true

      // Verify MemberBalance collection queries
      expect(mockMemberBalanceCollection.findOne.callCount).to.equal(3)

      // Verify Plugin.find calls
      expect(stubPluginFind.callCount).to.equal(3)

      // Verify MemberGovernanceFactory.create calls
      // Should be called for lockToVote governance (3 times) + tokenVoting governance (3 times - one per memberBalance that has plugins)
      expect(stubMemberGovernanceFactoryCreate.callCount).to.equal(6) // 3 lockToVote + 3 tokenVoting

      // Verify lockToVote governance creation
      expect(
        stubMemberGovernanceFactoryCreate.calledWith({
          address: mockVeTokens[0].users[0].escrowAddress,
          network: mockVeTokens[0].users[0].network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
          extraParams: {
            escrowAdapterAddress: mockVeTokens[0].tokenAddress,
          },
        }),
      ).to.be.true

      // Verify tokenVoting governance creation
      expect(
        stubMemberGovernanceFactoryCreate.calledWith({
          address: mockPlugins1[0].tokenAddress,
          network: mockPlugins1[0].network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
        }),
      ).to.be.true

      // Verify governance.update calls (lockToVote)
      expect(governanceStub.update.callCount).to.equal(3)
      expect(
        governanceStub.update.calledWith(mockVeTokens[0].users[0].memberAddress, {
          tokenIds: ['1'],
          delegateReceiverAddress: mockMemberBalance1.address,
          lastActivity: mockMemberBalance1.lastSyncAmountBlockNumber,
        }),
      ).to.be.true
      expect(
        governanceStub.update.calledWith(mockVeTokens[0].users[1].memberAddress, {
          tokenIds: ['2'],
          delegateReceiverAddress: mockMemberBalance2.address,
          lastActivity: mockMemberBalance2.lastSyncAmountBlockNumber,
        }),
      ).to.be.true
      expect(
        governanceStub.update.calledWith(mockVeTokens[1].users[0].memberAddress, {
          tokenIds: ['3'],
          delegateReceiverAddress: mockMemberBalance3.address,
          lastActivity: mockMemberBalance3.lastSyncAmountBlockNumber,
        }),
      ).to.be.true

      // Verify governance.updatePluginMetrics calls
      expect(governanceStub.updatePluginMetrics.callCount).to.equal(3) // 1 plugin per valid lock
      expect(
        governanceStub.updatePluginMetrics.calledWith({
          memberAddress: mockVeTokens[0].users[0].memberAddress,
          pluginAddress: mockPlugins1[0].address,
          daoAddress: mockPlugins1[0].daoAddress,
          network: mockPlugins1[0].network,
          lastActivity: mockMemberBalance1.lastSyncAmountBlockNumber,
        }),
      ).to.be.true

      // Verify logging
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle no Lock documents to migrate', async () => {
      stubLockAggregate.resolves([])

      await veLockerMigration.start()

      expect(stubLockAggregate.calledOnce).to.be.true
      expect(mockMemberBalanceCollection.findOne.called).to.be.false
      expect(stubPluginFind.called).to.be.false
      expect(stubMemberGovernanceFactoryCreate.called).to.be.false
      expect(governanceStub.update.called).to.be.false
      expect(stubLoggerInfo.calledWith('No Lock found')).to.be.true
    })

    it('should skip users when MemberBalance not found', async () => {
      const mockVeTokens = [
        {
          _id: '0xtoken1234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
              tokenId: '1',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
            {
              memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
              tokenId: '2',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
          ],
        },
      ]

      const mockMemberBalance = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        tokenIds: ['1'],
        lastSyncAmountBlockNumber: 12345678,
      }

      const mockPlugins = [
        {
          address: '0xplugin1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
        },
      ]

      stubLockAggregate.resolves(mockVeTokens)

      // First user has matching MemberBalance, second doesn't
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['1'] },
        })
        .resolves(mockMemberBalance)
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['2'] },
        })
        .resolves(null)

      stubPluginFind.resolves(mockPlugins)

      await veLockerMigration.start()

      // Verify only one governance update was called (for the user with MemberBalance)
      expect(governanceStub.update.callCount).to.equal(1)
      expect(
        governanceStub.update.calledWith(mockVeTokens[0].users[0].memberAddress, {
          tokenIds: ['1'],
          delegateReceiverAddress: mockMemberBalance.address,
          lastActivity: mockMemberBalance.lastSyncAmountBlockNumber,
        }),
      ).to.be.true
    })

    it('should skip users when tokenId not included in MemberBalance tokenIds', async () => {
      const mockVeTokens = [
        {
          _id: '0xtoken1234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
              tokenId: '1',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
            {
              memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
              tokenId: '2',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
          ],
        },
      ]

      const mockMemberBalance1 = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        tokenIds: ['1', '3'], // includes tokenId '1'
        lastSyncAmountBlockNumber: 12345678,
      }

      const mockMemberBalance2 = {
        address: '0x2234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
        network: NetworksEnum.ethereumMainnet,
        tokenIds: ['4', '5'], // does NOT include tokenId '2'
        lastSyncAmountBlockNumber: 12345679,
      }

      const mockPlugins = [
        {
          address: '0xplugin1234567890abcdef1234567890abcdef12',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao1234567890abcdef1234567890abcdef1234',
        },
      ]

      stubLockAggregate.resolves(mockVeTokens)

      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['1'] },
        })
        .resolves(mockMemberBalance1)
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['2'] },
        })
        .resolves(mockMemberBalance2)

      stubPluginFind.resolves(mockPlugins)

      await veLockerMigration.start()

      // Verify only one governance update was called (for the user whose tokenId is included)
      expect(governanceStub.update.callCount).to.equal(1)
      expect(
        governanceStub.update.calledWith(mockVeTokens[0].users[0].memberAddress, {
          tokenIds: ['1'],
          delegateReceiverAddress: mockMemberBalance1.address,
          lastActivity: mockMemberBalance1.lastSyncAmountBlockNumber,
        }),
      ).to.be.true
    })

    it('should handle errors and continue processing other tokens', async () => {
      const mockVeTokens = [
        {
          _id: '0xtoken1234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken1234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x1234567890abcdef1234567890abcdef12345678',
              tokenId: '1',
              escrowAddress: '0xescrow1234567890abcdef1234567890abcdef12',
              network: NetworksEnum.ethereumMainnet,
            },
          ],
        },
        {
          _id: '0xtoken2234567890abcdef1234567890abcdef12',
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          users: [
            {
              memberAddress: '0x2234567890abcdef1234567890abcdef12345678',
              tokenId: '2',
              escrowAddress: '0xescrow2234567890abcdef1234567890abcdef12',
              network: NetworksEnum.polygonMainnet,
            },
          ],
        },
      ]

      const mockMemberBalance2 = {
        address: '0x2234567890abcdef1234567890abcdef12345678',
        tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
        network: NetworksEnum.polygonMainnet,
        tokenIds: ['2'],
        lastSyncAmountBlockNumber: 12345679,
      }

      const mockPlugins2 = [
        {
          address: '0xplugin2234567890abcdef1234567890abcdef12',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: '0xtoken2234567890abcdef1234567890abcdef12',
          daoAddress: '0xdao2234567890abcdef1234567890abcdef1234',
        },
      ]

      stubLockAggregate.resolves(mockVeTokens)

      // First token causes error
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[0].tokenAddress,
          tokenIds: { $in: ['1'] },
        })
        .rejects(new Error('Database error'))

      // Second token works fine
      mockMemberBalanceCollection.findOne
        .withArgs({
          tokenAddress: mockVeTokens[1].tokenAddress,
          tokenIds: { $in: ['2'] },
        })
        .resolves(mockMemberBalance2)

      stubPluginFind.resolves(mockPlugins2)

      await veLockerMigration.start()

      // Verify error was logged
      expect(stubLoggerError.calledWith('updating lockToVoteMember')).to.be.true

      // Verify second token was still processed
      expect(governanceStub.update.callCount).to.equal(1)
      expect(
        governanceStub.update.calledWith(mockVeTokens[1].users[0].memberAddress, {
          tokenIds: ['2'],
          delegateReceiverAddress: mockMemberBalance2.address,
          lastActivity: mockMemberBalance2.lastSyncAmountBlockNumber,
        }),
      ).to.be.true

      // Verify completion log
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle migration failure', async () => {
      const error = new Error('Lock aggregation failed')
      stubLockAggregate.rejects(error)

      await expect(veLockerMigration.start()).to.be.rejectedWith('Lock aggregation failed')

      expect(stubLoggerError.calledWith('Migration failed')).to.be.true
      expect(stubLoggerError.firstCall.args[1].error).to.equal(error)
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await veLockerMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })

  describe('should create the users and all the related tables without any stub', () => {
    it('should save the members from the mock data for veLocker', async () => {
      sandbox.restore()

      // Create DAO first
      await Models.Dao.create(MockVeLockerData.dao)

      // Create plugins
      await Models.Plugin.insertMany(MockVeLockerData.plugins)

      // Create Lock documents
      await Models.Lock.insertMany(MockVeLockerData.locks)

      // Create MemberBalance documents
      await mongoose.connection.collection('MemberBalance').insertMany(MockVeLockerData.memberBalance)

      // Create MemberMetrics documents
      await mongoose.connection.collection('MemberMetric').insertMany(MockVeLockerData.memberMetrics)

      await veLockerMigration.start()

      const lockManagerMembers = await Models.Lock.find({
        delegateReceiverAddress: { $exists: true },
      })

      expect(lockManagerMembers.length).to.be.eq(6)

      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.be.eq(2)

      for (const pluginMetric of pluginMetrics) {
        expect(pluginMetric.firstActivity).to.be.not.undefined
        expect(pluginMetric.lastActivity).to.be.not.undefined
        expect(pluginMetric.firstActivity).to.be.greaterThan(0)
        expect(pluginMetric.lastActivity).to.be.greaterThan(0)
      }
    })
  })
})
