import MemberController from '@api/controllers/member'
import { Models } from '@dbModels'
import logger from '@logger'
import pluginMembersMigration from '@src/migrations/20250804122527-pluginMembers'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('migration: pluginMembers', () => {
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
    // Clean up collections between tests
    await mongoose.connection.collection('DaoMemberMapping').deleteMany({})
    await mongoose.connection.collection('MemberMetric').deleteMany({})
  })

  describe('pluginMembersMigration with real database', () => {
    it('should successfully migrate daoMemberMapping documents with null tokenAddress', async () => {
      // Prepare DaoMemberMapping data (old structure)
      const mockDaoMemberMappings = [
        {
          memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
          daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null, // Non-token plugin (multisig)
        },
        {
          memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
          daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null,
        },
        {
          memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
          daoAddress: '0xbBCdeF1234567890abCdeF1234567890abCdEf12',
          pluginAddress: '0x667890AbCdEF1234567890abCdef1234567890AB',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: null,
        },
        // This one should be skipped (has tokenAddress)
        {
          memberAddress: '0x4444567890AbCdef1234567890abcDef12345678',
          daoAddress: '0xccDEf1234567890abCdEf1234567890abcDef12',
          pluginAddress: '0x767890abCDeF1234567890abcDeF1234567890AB',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: '0x123456789aBCdeF1234567890abCdEf12345678',
        },
      ]

      // Prepare MemberMetric data (old structure with activity timestamps)
      const mockMemberMetrics = [
        {
          address: '0x1234567890AbcdEF1234567890aBcdef12345678',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          firstActivity: 1000000000,
          lastActivity: 1234567899,
        },
        {
          address: '0x2234567890abCdEF1234567890AbcDEf12345678',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          firstActivity: 1100000000,
          lastActivity: 1234567900,
        },
        // Member 3 has no metrics
      ]

      // Create DAOs
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumMainnet}-0xabCDEF1234567890ABcDEF1234567890aBCDeF12`,
        address: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test DAO 1',
        blockNumber: 1000,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      await Models.Dao.create({
        id: `${NetworksEnum.polygonMainnet}-0xbBCdeF1234567890abCdeF1234567890abCdEf12`,
        address: '0xbBCdeF1234567890abCdeF1234567890abCdEf12',
        network: NetworksEnum.polygonMainnet,
        name: 'Test DAO 2',
        blockNumber: 2000,
        blockTimestamp: Date.now(),
        transactionHash: '0x456',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      // Create plugins (non-token plugins)
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0x567890aBCDeF1234567890AbcDEf1234567890Ab`,
        address: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: null, // This is a multisig plugin
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 1001,
        blockTimestamp: Date.now(),
        transactionHash: '0x789',
      })

      await Models.Plugin.create({
        id: `${NetworksEnum.polygonMainnet}-0x667890AbCdEF1234567890abCdef1234567890AB`,
        address: '0x667890AbCdEF1234567890abCdef1234567890AB',
        daoAddress: '0xbBCdeF1234567890abCdeF1234567890abCdEf12',
        network: NetworksEnum.polygonMainnet,
        tokenAddress: null, // This is an admin plugin
        interfaceType: IPluginInterfaceType.admin,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 2001,
        blockTimestamp: Date.now(),
        transactionHash: '0xabc',
      })

      // Insert old data into collections
      await mongoose.connection.collection('DaoMemberMapping').insertMany(mockDaoMemberMappings)
      await mongoose.connection.collection('MemberMetric').insertMany(mockMemberMetrics)

      // Create Proposals and Votes to test that counts are calculated correctly
      // Member 1 created 3 proposals
      await Models.Proposal.create({
        transactionHash: '0xaaa',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        proposalIndex: '0',
        creatorAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 1,
        proposalId: '0x01',
      })

      await Models.Proposal.create({
        transactionHash: '0xbbb',
        blockNumber: 1001,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        proposalIndex: '1',
        creatorAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 2,
        proposalId: '0x02',
      })

      await Models.Proposal.create({
        transactionHash: '0xccc',
        blockNumber: 1002,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        proposalIndex: '2',
        creatorAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 3,
        proposalId: '0x03',
      })

      // Member 2 created 1 proposal
      await Models.Proposal.create({
        transactionHash: '0xddd',
        blockNumber: 1003,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        proposalIndex: '3',
        creatorAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 4,
        proposalId: '0x04',
      })

      // Member 1 voted 10 times
      const votes1 = Array.from({ length: 10 }, (_, i) => ({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        proposalId: '0x01',
        voteOption: 1,
        votingPower: '1000000000000000000',
        blockNumber: 2000 + i,
        transactionHash: `0xvote1${i}`,
        transactionIndex: i,
        logIndex: i * 2,
      }))
      await Promise.all(votes1.map(vote => Models.Vote.create(vote)))

      // Member 2 voted 5 times
      const votes2 = Array.from({ length: 5 }, (_, i) => ({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        proposalId: '0x01',
        voteOption: 1,
        votingPower: '1000000000000000000',
        blockNumber: 3000 + i,
        transactionHash: `0xvote2${i}`,
        transactionIndex: i + 10,
        logIndex: (i + 10) * 2,
      }))
      await Promise.all(votes2.map(vote => Models.Vote.create(vote)))

      // Run migration
      await pluginMembersMigration.start()

      // VERIFY MIGRATION RESULTS

      // 1. Check Member collection - should have 3 unique members (excluding the one with tokenAddress)
      const members = await Models.Member.find({})
      expect(members.length).to.equal(3)

      const memberAddresses = members.map((m: any) => m.address.toLowerCase()).sort()
      expect(memberAddresses).to.deep.equal([
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x2234567890abcdef1234567890abcdef12345678',
        '0x3334567890abcdef1234567890abcdef12345678',
      ])

      // 2. Check PluginMember collection - should have 3 entries
      const pluginMembers = await Models.PluginMember.find({})
      expect(pluginMembers.length).to.equal(3)

      // Verify first member's plugin membership
      const pluginMember1 = await Models.PluginMember.findOne({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
      })
      expect(pluginMember1).to.exist
      expect(pluginMember1?.daoAddress).to.equal('0xabCDEF1234567890ABcDEF1234567890aBCDeF12')
      expect(pluginMember1?.network).to.equal(NetworksEnum.ethereumMainnet)

      // Verify second member's plugin membership
      const pluginMember2 = await Models.PluginMember.findOne({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
      })
      expect(pluginMember2).to.exist
      expect(pluginMember2?.daoAddress).to.equal('0xabCDEF1234567890ABcDEF1234567890aBCDeF12')

      // Verify third member's plugin membership (different plugin)
      const pluginMember3 = await Models.PluginMember.findOne({
        memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
        pluginAddress: '0x667890AbCdEF1234567890abCdef1234567890AB',
      })
      expect(pluginMember3).to.exist
      expect(pluginMember3?.daoAddress).to.equal('0xbBCdeF1234567890abCdeF1234567890abCdEf12')
      expect(pluginMember3?.network).to.equal(NetworksEnum.polygonMainnet)

      // 3. Check PluginMetrics collection
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(3)

      // Verify metrics for member 1 (has MemberMetric data + proposals/votes)
      const metrics1 = await Models.PluginMetrics.findOne({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
      })
      expect(metrics1).to.exist
      expect(metrics1?.lastActivity).to.equal(1234567899)
      expect(metrics1?.firstActivity).to.equal(1000000000)
      expect(metrics1?.proposalCount).to.equal(3) // Created 3 proposals
      expect(metrics1?.voteCount).to.equal(10) // Voted 10 times

      // Verify metrics for member 2 (has MemberMetric data + proposals/votes)
      const metrics2 = await Models.PluginMetrics.findOne({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
      })
      expect(metrics2).to.exist
      expect(metrics2?.lastActivity).to.equal(1234567900)
      expect(metrics2?.firstActivity).to.equal(1100000000)
      expect(metrics2?.proposalCount).to.equal(1) // Created 1 proposal
      expect(metrics2?.voteCount).to.equal(5) // Voted 5 times

      // Verify metrics for member 3 (no MemberMetric data, no proposals/votes)
      const metrics3 = await Models.PluginMetrics.findOne({
        memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
        pluginAddress: '0x667890AbCdEF1234567890abCdef1234567890AB',
      })
      expect(metrics3).to.exist
      // No lastActivity or firstActivity since there was no MemberMetric data
      expect(metrics3?.lastActivity).to.be.null
      expect(metrics3?.firstActivity).to.be.null
      expect(metrics3?.proposalCount).to.equal(0) // No proposals
      expect(metrics3?.voteCount).to.equal(0) // No votes

      // Test the MemberController query to ensure it returns the correct members
      const queryMembers = await MemberController.getMembersWithPagination(
        {
          page: 1,
          limit: 100,
          order: 'desc',
        },
        {
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
          network: NetworksEnum.ethereumMainnet,
        },
      )
      console.log('Query Members Result:', queryMembers)

      // Expect to have 2 members for this plugin (member 1 and member 2)
      // Member 3 belongs to a different plugin
      expect(queryMembers.data.length).to.equal(2)

      // Verify the members are the correct ones
      const queriedAddresses = queryMembers.data.map((m: any) => m.address.toLowerCase()).sort()
      expect(queriedAddresses).to.deep.equal([
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x2234567890abcdef1234567890abcdef12345678',
      ])
    })

    it('should skip documents where plugin is not found', async () => {
      // Insert test data without creating corresponding plugin
      const mockDaoMemberMappings = [
        {
          memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
          daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null,
        },
      ]

      await mongoose.connection.collection('DaoMemberMapping').insertMany(mockDaoMemberMappings)

      // Run migration
      await pluginMembersMigration.start()

      // Member is still created
      const members = await Models.Member.find({})
      expect(members.length).to.equal(1)
      expect(members[0].address.toLowerCase()).to.equal('0x1234567890abcdef1234567890abcdef12345678')

      // But PluginMember is not created without plugin
      const pluginMembers = await Models.PluginMember.find({})
      expect(pluginMembers.length).to.equal(0)

      // And PluginMetrics is not created without plugin
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(0)
    })

    it('should handle errors gracefully and continue processing', async () => {
      // Create test data
      const mockDaoMemberMappings = [
        {
          memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
          daoAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: null,
        },
        {
          memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
          daoAddress: '0xbbcdef1234567890abcdef1234567890abcdef12',
          pluginAddress: '0x667890abcdef1234567890abcdef1234567890ab',
          network: NetworksEnum.polygonMainnet,
          tokenAddress: null,
        },
      ]

      // Create DAOs
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumMainnet}-0xabCDEF1234567890ABcDEF1234567890aBCDeF12`,
        address: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test DAO 1',
        blockNumber: 1000,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      await Models.Dao.create({
        id: `${NetworksEnum.polygonMainnet}-0xbBCdeF1234567890abCdeF1234567890abCdEf12`,
        address: '0xbBCdeF1234567890abCdeF1234567890abCdEf12',
        network: NetworksEnum.polygonMainnet,
        name: 'Test DAO 2',
        blockNumber: 2000,
        blockTimestamp: Date.now(),
        transactionHash: '0x456',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      // Only create one plugin (second document will skip due to missing plugin)
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0x567890aBCDeF1234567890AbcDEf1234567890Ab`,
        address: '0x567890aBCDeF1234567890AbcDEf1234567890Ab',
        daoAddress: '0xabCDEF1234567890ABcDEF1234567890aBCDeF12',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 1001,
        blockTimestamp: Date.now(),
        transactionHash: '0x789',
      })

      await mongoose.connection.collection('DaoMemberMapping').insertMany(mockDaoMemberMappings)

      // Run migration
      await pluginMembersMigration.start()

      // Both members should be created
      const members = await Models.Member.find({})
      expect(members.length).to.equal(2)

      // Only first document should have PluginMember (second skipped due to missing plugin)
      const pluginMembers = await Models.PluginMember.find({})
      expect(pluginMembers.length).to.equal(1)
      expect(pluginMembers[0].memberAddress.toLowerCase()).to.equal('0x1234567890abcdef1234567890abcdef12345678')

      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(1)

      // Check completion log
      const loggerInfo = logger.info as sinon.SinonStub
      const completionLogCall = loggerInfo.getCalls().find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
      expect(completionLogCall?.args[1].totalProcessed).to.equal(1) // Only 1 fully processed
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await pluginMembersMigration.stop()
    })
  })
})
