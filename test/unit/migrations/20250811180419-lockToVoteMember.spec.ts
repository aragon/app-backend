import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import lockToVoteMemberMigration from '@src/migrations/20250811180419-lockToVoteMember'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'

describe('migration: lockToVoteMember', () => {
  let sandbox: SinonSandbox
  let mockLockManagerMemberCollection: any
  let stubPluginFindOne: SinonStub
  let stubLockManagerMemberCreate: SinonStub
  let stubLoggerInfo: SinonStub
  let stubLoggerError: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Mock collections
    mockLockManagerMemberCollection = {
      find: sandbox.stub().returnsThis(),
      toArray: sandbox.stub(),
    }

    // Stub mongoose connection
    sandbox
      .stub(mongoose.connection, 'collection')
      .withArgs('LockManagerMember')
      .returns(mockLockManagerMemberCollection)

    // Stub Plugin model
    stubPluginFindOne = sandbox.stub(Models.Plugin, 'findOne')

    // Stub LockManagerMember model
    stubLockManagerMemberCreate = sandbox.stub(Models.LockManagerMember, 'create').resolves()

    // Stub logger methods
    stubLoggerInfo = sandbox.stub(logger, 'info')
    stubLoggerError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('lockToVoteMemberMigration', () => {
    it('should successfully migrate LockManagerMember documents', async () => {
      const mockLockManagerMembers = [
        {
          _id: '68936662e1d2814ae0ce417b',
          id: 'ethereum-sepolia-0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b-0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          votingPower: '408000000000000000000',
          transactionHash: '0x009cfcf0f3623fb8ac2e6720b80aa81e2e56fe7f7636f53fa29a952479784e06',
          blockNumber: 8931464,
          blockTimestamp: 1754558136,
          isActive: true,
          createdAt: new Date('2025-08-06T14:27:46.206+0000'),
          updatedAt: new Date('2025-08-07T09:15:40.125+0000'),
          __v: 0,
        },
        {
          _id: '68936ca469c5deec51ccec9a',
          id: 'ethereum-sepolia-0xfC907E0a59D555C7caBB1B110E1630d9576cE29e-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          votingPower: '15506703',
          transactionHash: '0x850eb1120350e78f8d2dda60d5544be587a179fea7fd8dfa0fa19e459f5a81e5',
          blockNumber: 8926240,
          blockTimestamp: 1754495148,
          isActive: true,
          createdAt: new Date('2025-08-06T14:54:28.454+0000'),
          updatedAt: new Date('2025-08-06T15:45:59.625+0000'),
          __v: 0,
        },
        {
          _id: '68937692a535d91e00b8b25d',
          id: 'ethereum-sepolia-0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b-0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          memberAddress: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          votingPower: '11000000000000000000',
          transactionHash: '0xb1ed5dd9b87e02522581285005fc4dd8d15a76a042508505807056e5143aec42',
          blockNumber: 8926195,
          blockTimestamp: 1754494608,
          isActive: true,
          createdAt: new Date('2025-08-06T15:36:50.547+0000'),
          updatedAt: new Date('2025-08-06T15:36:50.547+0000'),
          __v: 0,
        },
        {
          _id: '68937996a535d91e00b9065a',
          id: 'ethereum-sepolia-0xfC907E0a59D555C7caBB1B110E1630d9576cE29e-0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          votingPower: '10000000',
          transactionHash: '0x899d72b83f76a1272c038160e0e1c2b1ed0bbc11c89a674b9300cf74cd0bcc70',
          blockNumber: 8926259,
          blockTimestamp: 1754495376,
          isActive: true,
          createdAt: new Date('2025-08-06T15:49:42.282+0000'),
          updatedAt: new Date('2025-08-06T15:49:42.282+0000'),
          __v: 0,
        },
      ]

      // Mock plugins with lockManagerAddress
      const mockPlugin1 = {
        address: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
        lockManagerAddress: '0xLockManager1234567890abcdef1234567890ab',
        interfaceType: IPluginInterfaceType.lockToVote,
        network: 'ethereum-sepolia',
      }

      const mockPlugin2 = {
        address: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        lockManagerAddress: '0xLockManager2234567890abcdef1234567890ab',
        interfaceType: IPluginInterfaceType.lockToVote,
        network: 'ethereum-sepolia',
      }

      mockLockManagerMemberCollection.toArray.resolves(mockLockManagerMembers)

      // Setup Plugin.findOne stubs for each unique plugin
      stubPluginFindOne
        .withArgs({
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          lockManagerAddress: { $exists: true },
        })
        .resolves(mockPlugin1)

      stubPluginFindOne
        .withArgs({
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          lockManagerAddress: { $exists: true },
        })
        .resolves(mockPlugin2)

      // Stub getEntityId
      sandbox.stub(Models.LockManagerMember, 'getEntityId').callsFake((params: any) => {
        return `${params.network}-${params.lockManagerAddress}-${params.memberAddress}`
      })

      await lockToVoteMemberMigration.start()

      // Verify queries
      expect(mockLockManagerMemberCollection.find.calledOnce).to.be.true
      expect(mockLockManagerMemberCollection.toArray.calledOnce).to.be.true

      // Verify LockManagerMember.create calls for each member
      // First member with plugin1
      expect(
        stubLockManagerMemberCreate.calledWith({
          id: 'ethereum-sepolia-0xLockManager1234567890abcdef1234567890ab-0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          network: 'ethereum-sepolia',
          lockManagerAddress: '0xLockManager1234567890abcdef1234567890ab',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          votingPower: '408000000000000000000',
        }),
      ).to.be.true

      // Second member with plugin2
      expect(
        stubLockManagerMemberCreate.calledWith({
          id: 'ethereum-sepolia-0xLockManager2234567890abcdef1234567890ab-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          network: 'ethereum-sepolia',
          lockManagerAddress: '0xLockManager2234567890abcdef1234567890ab',
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          votingPower: '15506703',
        }),
      ).to.be.true

      // Third member with plugin1 (same plugin as first)
      expect(
        stubLockManagerMemberCreate.calledWith({
          id: 'ethereum-sepolia-0xLockManager1234567890abcdef1234567890ab-0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          network: 'ethereum-sepolia',
          lockManagerAddress: '0xLockManager1234567890abcdef1234567890ab',
          memberAddress: '0xF6ad40D5D477ade0C640eaD49944bdD0AA1fBF05',
          votingPower: '11000000000000000000',
        }),
      ).to.be.true

      // Fourth member with plugin2
      expect(
        stubLockManagerMemberCreate.calledWith({
          id: 'ethereum-sepolia-0xLockManager2234567890abcdef1234567890ab-0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          network: 'ethereum-sepolia',
          lockManagerAddress: '0xLockManager2234567890abcdef1234567890ab',
          memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          votingPower: '10000000',
        }),
      ).to.be.true

      // Verify total calls
      expect(stubLockManagerMemberCreate.callCount).to.equal(4)

      // Verify logging
      expect(stubLoggerInfo.calledWith('Starting migration')).to.be.true
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle no documents to migrate', async () => {
      mockLockManagerMemberCollection.toArray.resolves([])

      await lockToVoteMemberMigration.start()

      expect(mockLockManagerMemberCollection.find.calledOnce).to.be.true
      expect(stubLockManagerMemberCreate.called).to.be.false
      expect(stubLoggerInfo.calledWith('No MemberBalance documents to migrate')).to.be.true
    })

    it('should skip members where plugin has no lockManagerAddress', async () => {
      const mockLockManagerMembers = [
        {
          _id: '68936662e1d2814ae0ce417b',
          id: 'ethereum-sepolia-0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b-0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          votingPower: '408000000000000000000',
        },
      ]

      mockLockManagerMemberCollection.toArray.resolves(mockLockManagerMembers)

      // Return plugin without lockManagerAddress
      stubPluginFindOne.resolves({
        address: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
        interfaceType: IPluginInterfaceType.tokenVoting,
        network: 'ethereum-sepolia',
      })

      await lockToVoteMemberMigration.start()

      // Verify plugin was queried
      expect(stubPluginFindOne.calledOnce).to.be.true

      // Verify no LockManagerMember was created
      expect(stubLockManagerMemberCreate.called).to.be.false

      // Verify completion log
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle errors and continue processing', async () => {
      const mockLockManagerMembers = [
        {
          _id: '68936662e1d2814ae0ce417b',
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          votingPower: '408000000000000000000',
        },
        {
          _id: '68936ca469c5deec51ccec9a',
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          votingPower: '15506703',
        },
      ]

      const mockPlugin = {
        address: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        lockManagerAddress: '0xLockManager2234567890abcdef1234567890ab',
        interfaceType: IPluginInterfaceType.lockToVote,
        network: 'ethereum-sepolia',
      }

      mockLockManagerMemberCollection.toArray.resolves(mockLockManagerMembers)

      // Make first Plugin.findOne fail, second succeed
      stubPluginFindOne.onFirstCall().rejects(new Error('Test error')).onSecondCall().resolves(mockPlugin)

      // Stub getEntityId for second member
      sandbox
        .stub(Models.LockManagerMember, 'getEntityId')
        .returns(
          'ethereum-sepolia-0xLockManager2234567890abcdef1234567890ab-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
        )

      await lockToVoteMemberMigration.start()

      // Verify error handling
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.equal('updating lockToVoteMember')
      expect(stubLoggerError.firstCall.args[1].pluginAddress).to.equal('0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b')

      // Verify second document was still processed
      expect(stubLockManagerMemberCreate.callCount).to.equal(1)
      expect(
        stubLockManagerMemberCreate.calledWith({
          id: 'ethereum-sepolia-0xLockManager2234567890abcdef1234567890ab-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          network: 'ethereum-sepolia',
          lockManagerAddress: '0xLockManager2234567890abcdef1234567890ab',
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          votingPower: '15506703',
        }),
      ).to.be.true

      // Verify completion
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle migration failure', async () => {
      const error = new Error('Database connection failed')
      mockLockManagerMemberCollection.toArray.rejects(error)

      await expect(lockToVoteMemberMigration.start()).to.be.rejectedWith('Database connection failed')

      expect(stubLoggerError.calledWith('Migration failed')).to.be.true
      expect(stubLoggerError.firstCall.args[1].error).to.equal(error)
    })

    it('should handle plugin not found', async () => {
      const mockLockManagerMembers = [
        {
          _id: '68936662e1d2814ae0ce417b',
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          votingPower: '408000000000000000000',
        },
      ]

      mockLockManagerMemberCollection.toArray.resolves(mockLockManagerMembers)

      // Return null for plugin not found
      stubPluginFindOne.resolves(null)

      await lockToVoteMemberMigration.start()

      // Verify no LockManagerMember was created
      expect(stubLockManagerMemberCreate.called).to.be.false

      // Verify completion
      expect(stubLoggerInfo.calledWith('Migration completed successfully')).to.be.true
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await lockToVoteMemberMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })
})
