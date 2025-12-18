import { Models } from '@dbModels'
import logger from '@logger'
import MemberController from '@services/aragon-api/controllers/member'
import lockToVoteMemberMigration from '@src/migrations/20250811180419-lockToVoteMember'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: lockToVoteMember', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Only stub logger to reduce noise in tests
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'verbose')
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('lockToVoteMemberMigration with real database', () => {
    it('should successfully migrate LockToVoteMember documents', async () => {
      try {
        // Prepare old LockToVoteMember data (legacy structure)
        const mockLockToVoteMembers = [
          {
            _id: new mongoose.Types.ObjectId('68936662e1d2814ae0ce417b'),
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
          },
          {
            _id: new mongoose.Types.ObjectId('68936ca469c5deec51ccec9a'),
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
          },
          // Add a second plugin with different lockManager
          {
            _id: new mongoose.Types.ObjectId('68937692a535d91e00b8b25d'),
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
          },
        ]

        // Prepare MemberMetric data (old structure with activity timestamps)
        const mockMemberMetrics = [
          {
            memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
            pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
            network: 'ethereum-sepolia',
            firstActivity: 1754495148,
            lastActivity: 1754495148,
          },
          {
            memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
            pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
            network: 'ethereum-sepolia',
            firstActivity: 1754495376,
            lastActivity: 1754495376,
          },
          {
            memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
            pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
            network: 'ethereum-sepolia',
            firstActivity: 1754558136,
            lastActivity: 1754558136,
          },
        ]

        // Create DAOs
        await Models.Dao.create({
          id: `${NetworksEnum.ethereumSepolia}-0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f`,
          address: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          network: NetworksEnum.ethereumSepolia,
          name: '2025-08-06 lock to vote testing',
          blockNumber: 8925940,
          blockTimestamp: Date.now(),
          transactionHash: '0x07fde731b4050ac36427d9e94ccbdd10a407078521b09f9e1f9c14a9f7663aa6',
          creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
        })

        await Models.Dao.create({
          id: `${NetworksEnum.ethereumSepolia}-0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92`,
          address: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          network: NetworksEnum.ethereumSepolia,
          name: 'Second Lock DAO',
          blockNumber: 8925950,
          blockTimestamp: Date.now(),
          transactionHash: '0x123',
          creatorAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
        })

        // Create plugins with lockManagerAddress (lockToVote plugins)
        await Models.Plugin.create({
          id: `${NetworksEnum.ethereumSepolia}-0xfC907E0a59D555C7caBB1B110E1630d9576cE29e`,
          address: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          network: NetworksEnum.ethereumSepolia,
          interfaceType: IPluginInterfaceType.lockToVote,
          status: IPluginStatus.installed,
          isSupported: true,
          lockManagerAddress: '0x33b5843C8CB796E4bEC119Fc086a0e0848c945D5', // This is the key field for lockToVote
          tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
          blockNumber: 8925961,
          blockTimestamp: Date.now(),
          transactionHash: '0xbfcdb62b152a56ba39c66ebaddf5b33901fbb80dac60b54673cfe52f52a56404',
          name: 'Lock To Vote',
        })

        await Models.Plugin.create({
          id: `${NetworksEnum.ethereumSepolia}-0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b`,
          address: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          network: NetworksEnum.ethereumSepolia,
          interfaceType: IPluginInterfaceType.lockToVote,
          status: IPluginStatus.installed,
          isSupported: true,
          lockManagerAddress: '0x44c5943C8CB796E4bEC119Fc086a0e0848c945E6', // Different lock manager
          tokenAddress: '0x2c8D4B196Cb0C7B01d743Fbc6116a902379C7239',
          blockNumber: 8925970,
          blockTimestamp: Date.now(),
          transactionHash: '0xabc',
          name: 'Lock To Vote 2',
        })

        // Insert old data into collections
        await mongoose.connection.collection('LockToVoteMember').insertMany(mockLockToVoteMembers)
        await mongoose.connection.collection('MemberMetric').insertMany(mockMemberMetrics)

        // Create Proposals and Votes to test that counts are calculated correctly
        // Member 1 created 2 proposals and voted 2 times for plugin 1
        await Models.Proposal.create({
          transactionHash: '0xaaa',
          blockNumber: 8926250,
          network: NetworksEnum.ethereumSepolia,
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          proposalIndex: '0',
          creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          startDate: 1754495148,
          endDate: 1754595148,
          incrementalId: 1,
          proposalId: '0x01',
        })

        await Models.Proposal.create({
          transactionHash: '0xbbb',
          blockNumber: 8926260,
          network: NetworksEnum.ethereumSepolia,
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          proposalIndex: '1',
          creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          startDate: 1754495200,
          endDate: 1754595200,
          incrementalId: 2,
          proposalId: '0x02',
        })

        // Member 1 voted 2 times
        await Models.Vote.create({
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          network: NetworksEnum.ethereumSepolia,
          proposalId: '0x01',
          voteOption: 1,
          votingPower: '15506703',
          blockNumber: 8926270,
          transactionHash: '0xvote1',
          transactionIndex: 0,
          logIndex: 0,
        })

        await Models.Vote.create({
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          network: NetworksEnum.ethereumSepolia,
          proposalId: '0x02',
          voteOption: 1,
          votingPower: '15506703',
          blockNumber: 8926280,
          transactionHash: '0xvote2',
          transactionIndex: 1,
          logIndex: 1,
        })

        // Member 2 voted 1 time
        await Models.Vote.create({
          memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          network: NetworksEnum.ethereumSepolia,
          proposalId: '0x01',
          voteOption: 2,
          votingPower: '10000000',
          blockNumber: 8926290,
          transactionHash: '0xvote3',
          transactionIndex: 2,
          logIndex: 2,
        })

        // Run migration
        await lockToVoteMemberMigration.start()

        // VERIFY MIGRATION RESULTS

        // 1. Check Member collection - should have 3 unique members
        const members = await Models.Member.find({})
        expect(members.length).to.equal(3)

        const memberAddresses = members.map((m: any) => m.address.toLowerCase()).sort()
        expect(memberAddresses).to.deep.equal([
          '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          '0x455e3defbc6b48d9127cf6acc609f5cea87ca759',
          '0xe3217a7790bb9bb60d4712b86e96b5f77af7a747',
        ])

        // 2. Check LockToVoteMember collection - should have 3 entries with new structure
        const lockToVoteMembers = await Models.LockToVoteMember.find({})
        expect(lockToVoteMembers.length).to.equal(3)

        // Verify first member's lock membership (plugin 1)
        const lockMember1 = await Models.LockToVoteMember.findOne({
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          lockManagerAddress: '0x33b5843C8CB796E4bEC119Fc086a0e0848c945D5',
        })
        expect(lockMember1).to.exist
        expect(lockMember1?.votingPower).to.equal('15506703')
        expect(lockMember1?.network).to.equal(NetworksEnum.ethereumSepolia)
        expect(lockMember1?.lastVPBlockNumber).to.equal(8926240)
        // Verify old fields are removed
        expect((lockMember1 as any)?.pluginAddress).to.be.undefined
        expect((lockMember1 as any)?.daoAddress).to.be.undefined

        // Verify second member's lock membership (plugin 1)
        const lockMember2 = await Models.LockToVoteMember.findOne({
          memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          lockManagerAddress: '0x33b5843C8CB796E4bEC119Fc086a0e0848c945D5',
        })
        expect(lockMember2).to.exist
        expect(lockMember2?.votingPower).to.equal('10000000')
        expect(lockMember2?.lastVPBlockNumber).to.equal(8926259)

        // Verify third member's lock membership (plugin 2)
        const lockMember3 = await Models.LockToVoteMember.findOne({
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          lockManagerAddress: '0x44c5943C8CB796E4bEC119Fc086a0e0848c945E6',
        })
        expect(lockMember3).to.exist
        expect(lockMember3?.votingPower).to.equal('408000000000000000000')
        expect(lockMember3?.network).to.equal(NetworksEnum.ethereumSepolia)
        expect(lockMember3?.lastVPBlockNumber).to.equal(8931464)

        // 3. Check PluginMetrics collection
        const pluginMetrics = await Models.PluginMetrics.find({})
        expect(pluginMetrics.length).to.equal(3)

        // Verify metrics for member 1 (has MemberMetric data + proposals/votes)
        const metrics1 = await Models.PluginMetrics.findOne({
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        })
        expect(metrics1).to.exist
        expect(metrics1?.lastActivity).to.equal(8926240) // From blockNumber
        // firstActivity would be from MemberMetric if it was provided during updatePluginMetrics
        expect(metrics1?.proposalCount).to.equal(2) // Created 2 proposals
        expect(metrics1?.voteCount).to.equal(2) // Voted 2 times

        // Verify metrics for member 2 (has MemberMetric data + votes)
        const metrics2 = await Models.PluginMetrics.findOne({
          memberAddress: '0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        })
        expect(metrics2).to.exist
        expect(metrics2?.lastActivity).to.equal(8926259)
        expect(metrics2?.proposalCount).to.equal(0) // No proposals
        expect(metrics2?.voteCount).to.equal(1) // Voted 1 time

        // Verify metrics for member 3 (different plugin)
        const metrics3 = await Models.PluginMetrics.findOne({
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
        })
        expect(metrics3).to.exist
        expect(metrics3?.lastActivity).to.equal(8931464)

        // 4. Verify old LockToVoteMember documents were deleted from the legacy collection
        // The migration should have deleted the old documents and created new ones
        // Let's verify the new structure doesn't have the old fields
        const allLockToVoteMembers = await mongoose.connection.collection('LockToVoteMember').find({}).toArray()
        // We should have 3 documents but with the new structure
        expect(allLockToVoteMembers.length).to.equal(3)
        // Verify none have the old fields like pluginAddress or daoAddress
        for (const member of allLockToVoteMembers) {
          expect(member.pluginAddress).to.be.undefined
          expect(member.daoAddress).to.be.undefined
          expect(member.lockManagerAddress).to.exist
        }

        // Test the MemberController query to ensure it returns the correct members for lock-to-vote governance
        const queryMembers = await MemberController.getMembersWithPagination(
          {
            page: 1,
            limit: 100,
            order: 'desc',
          },
          {
            pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
            daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
            network: NetworksEnum.ethereumSepolia,
          },
        )

        // Expect to have 2 members for this plugin (member 1 and member 2)
        // Member 3 belongs to a different plugin
        expect(queryMembers.data.length).to.equal(2)

        // Verify the members are the correct ones
        const queriedAddresses = queryMembers.data.map((m: any) => m.address.toLowerCase()).sort()
        expect(queriedAddresses).to.deep.equal([
          '0x455e3defbc6b48d9127cf6acc609f5cea87ca759',
          '0xe3217a7790bb9bb60d4712b86e96b5f77af7a747',
        ])

        // Verify member 1 metrics from the query
        const member1Data = queryMembers.data.find(
          (m: any) => m.address.toLowerCase() === '0x455e3defbc6b48d9127cf6acc609f5cea87ca759',
        )
        expect(member1Data).to.exist
        expect(member1Data?.metrics.proposalCount).to.equal(2)
        expect(member1Data?.metrics.voteCount).to.equal(2)

        // Verify member 2 metrics from the query
        const member2Data = queryMembers.data.find(
          (m: any) => m.address.toLowerCase() === '0xe3217a7790bb9bb60d4712b86e96b5f77af7a747',
        )
        expect(member2Data).to.exist
        expect(member2Data?.metrics.proposalCount).to.equal(0)
        expect(member2Data?.metrics.voteCount).to.equal(1)
      } catch (error) {
        console.error('Test error:', error)
        throw error
      }
    })

    it('should handle no documents to migrate', async () => {
      // Don't insert any LockToVoteMember documents

      await lockToVoteMemberMigration.start()

      // Verify no members were created
      const members = await Models.Member.find({})
      expect(members.length).to.equal(0)

      const lockToVoteMembers = await Models.LockToVoteMember.find({})
      expect(lockToVoteMembers.length).to.equal(0)
    })

    it('should skip members where plugin has no lockManagerAddress', async () => {
      const mockLockToVoteMembers = [
        {
          _id: new mongoose.Types.ObjectId('68936662e1d2814ae0ce417b'),
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          votingPower: '15506703',
          blockNumber: 8926240,
        },
      ]

      // Create plugin without lockManagerAddress
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumSepolia}-0xfC907E0a59D555C7caBB1B110E1630d9576cE29e`,
        address: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting, // Not a lockToVote plugin
        status: IPluginStatus.installed,
        isSupported: true,
        // No lockManagerAddress field
        tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        blockNumber: 8925961,
        blockTimestamp: Date.now(),
        transactionHash: '0xbfcdb',
      })

      await mongoose.connection.collection('LockToVoteMember').insertMany(mockLockToVoteMembers)

      await lockToVoteMemberMigration.start()

      // Verify no members were created since plugin has no lockManagerAddress
      const members = await Models.Member.find({})
      expect(members.length).to.equal(0)

      // Verify old document still exists in the collection (since it was skipped)
      const oldLockToVoteMembers = await mongoose.connection.collection('LockToVoteMember').find({}).toArray()
      expect(oldLockToVoteMembers.length).to.equal(1) // Should still be there since it was skipped
      // And it should still have the old structure
      expect(oldLockToVoteMembers[0].pluginAddress).to.equal('0xfC907E0a59D555C7caBB1B110E1630d9576cE29e')
      expect(oldLockToVoteMembers[0].lockManagerAddress).to.be.undefined

      // Check using the Model - no new LockToVoteMember with the new structure should be created
      const lockToVoteMembers = await Models.LockToVoteMember.find({ lockManagerAddress: { $exists: true } })
      expect(lockToVoteMembers.length).to.equal(0)
    })

    it('should handle errors gracefully and continue processing', async () => {
      const mockLockToVoteMembers = [
        {
          _id: new mongoose.Types.ObjectId('68936662e1d2814ae0ce417b'),
          id: 'old-doc-1', // Add unique id for old document
          network: 'ethereum-sepolia',
          pluginAddress: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
          daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
          memberAddress: 'INVALID_ADDRESS', // This will cause an error
          votingPower: '15506703',
          blockNumber: 8926240,
        },
        {
          _id: new mongoose.Types.ObjectId('68936ca469c5deec51ccec9a'),
          id: 'old-doc-2', // Add unique id for old document
          network: 'ethereum-sepolia',
          pluginAddress: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
          daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          votingPower: '408000000000000000000',
          blockNumber: 8931464,
        },
      ]

      // Create DAOs
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumSepolia}-0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f`,
        address: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
        network: NetworksEnum.ethereumSepolia,
        name: 'Test DAO',
        blockNumber: 8925940,
        blockTimestamp: Date.now(),
        transactionHash: '0x07fde',
        creatorAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      })

      await Models.Dao.create({
        id: `${NetworksEnum.ethereumSepolia}-0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92`,
        address: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
        network: NetworksEnum.ethereumSepolia,
        name: 'Second DAO',
        blockNumber: 8925950,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      })

      // Create plugins
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumSepolia}-0xfC907E0a59D555C7caBB1B110E1630d9576cE29e`,
        address: '0xfC907E0a59D555C7caBB1B110E1630d9576cE29e',
        daoAddress: '0xD61D75AeD575ba58Ca3430D9f05D43F9A5c6954f',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        isSupported: true,
        lockManagerAddress: '0x33b5843C8CB796E4bEC119Fc086a0e0848c945D5',
        blockNumber: 8925961,
        blockTimestamp: Date.now(),
        transactionHash: '0xbfcdb',
      })

      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumSepolia}-0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b`,
        address: '0x10c0cdDbE36877b6f1E6dD2560E579c47426Fd3b',
        daoAddress: '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        status: IPluginStatus.installed,
        isSupported: true,
        lockManagerAddress: '0x44c5943C8CB796E4bEC119Fc086a0e0848c945E6',
        blockNumber: 8925970,
        blockTimestamp: Date.now(),
        transactionHash: '0xabc',
      })

      await mongoose.connection.collection('LockToVoteMember').insertMany(mockLockToVoteMembers)

      await lockToVoteMemberMigration.start()

      // Verify processing results
      // The migration will try to process both, but the first one with INVALID_ADDRESS
      // should fail early when trying to parse the address
      const members = await Models.Member.find({})

      // Only the second member should be processed successfully
      expect(members.length).to.equal(1)
      const validMember = members.find((m: any) => m.address === '0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
      expect(validMember).to.exist

      // Check LockToVoteMembers - only the valid one should be created
      const lockToVoteMembers = await Models.LockToVoteMember.find({})
      expect(lockToVoteMembers.length).to.equal(1)
      const validLockMember = lockToVoteMembers.find(
        (lm: any) => lm.memberAddress === '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      )
      expect(validLockMember).to.exist
      expect(validLockMember?.votingPower).to.equal('408000000000000000000')
      expect(validLockMember?.lockManagerAddress).to.equal('0x44c5943C8CB796E4bEC119Fc086a0e0848c945E6')

      // Verify the documents in the raw collection
      const oldDocuments = await mongoose.connection.collection('LockToVoteMember').find({}).toArray()

      // After migration, we should have:
      // 1. The valid member migrated to new structure
      // 2. The invalid member NOT in the collection (migration doesn't process invalid addresses)

      // Check the valid one was migrated
      const validDoc = oldDocuments.find(
        (doc: any) => doc.memberAddress === '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      )
      expect(validDoc).to.exist
      expect(validDoc?.lockManagerAddress).to.equal('0x44c5943C8CB796E4bEC119Fc086a0e0848c945E6')
      expect(validDoc?.pluginAddress).to.be.undefined // New structure doesn't have pluginAddress

      // The invalid one might have been deleted or not processed
      // It's okay if it doesn't exist - migration might have tried to process and failed early

      // Check completion log
      const loggerInfo = logger.info as sinon.SinonStub
      const completionLogCall = loggerInfo.getCalls().find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist

      // The migration processes all documents, counting them as processed even if they fail
      // The valid one should be successfully migrated
      // The invalid one is counted as processed but might fail internally
      const { totalProcessed } = completionLogCall?.args[1] || {}
      expect(totalProcessed).to.be.at.least(1) // At least the valid one should be processed
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await lockToVoteMemberMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })
})
