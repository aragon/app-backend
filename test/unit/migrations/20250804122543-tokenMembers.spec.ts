import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import tokenMembersMigration from '@src/migrations/20250804122543-tokenMembers'
import { IPluginStatus, NetworksEnum, IPluginInterfaceType, ITokenType } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import MemberController from '@services/aragon-api/controllers/member'

describe('migration: tokenMembers', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Only stub logger to reduce noise in tests
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'verbose')

    // Clean up collections before each test
    await mongoose.connection.collection('MemberBalance').deleteMany({})
    await mongoose.connection.collection('MemberMetric').deleteMany({})
    await mongoose.connection.collection('MemberTransaction').deleteMany({})
    await Models.Member.deleteMany({})
    await Models.TokenMember.deleteMany({})
    await Models.PluginMetrics.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.Dao.deleteMany({})
    await Models.Token.deleteMany({})
    await Models.Proposal.deleteMany({})
    await Models.Vote.deleteMany({})
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up all collections between tests
    await mongoose.connection.collection('MemberBalance').deleteMany({})
    await mongoose.connection.collection('MemberMetric').deleteMany({})
    await mongoose.connection.collection('MemberTransaction').deleteMany({})
    // Also clean up the created collections
    await Models.Member.deleteMany({})
    await Models.TokenMember.deleteMany({})
    await Models.PluginMetrics.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.Dao.deleteMany({})
    await Models.Token.deleteMany({})
    await Models.Proposal.deleteMany({})
    await Models.Vote.deleteMany({})
  })

  describe('tokenMembersMigration with real database', () => {
    it('should successfully migrate MemberBalance documents to TokenMember', async () => {
      // Prepare MemberBalance data (old structure)
      const mockMemberBalances = [
        {
          address: '0x1234567890AbcdEF1234567890aBcdef12345678',
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000', // 1 token
          blockNumber: 1234567,
        },
        {
          address: '0x2234567890abCdEF1234567890AbcDEf12345678',
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '500000000000000000', // 0.5 token
          blockNumber: 1234568,
        },
        {
          address: '0x3334567890AbcDEF1234567890ABcdEF12345678',
          tokenAddress: '0xToken2234567890AbCdef1234567890ABcdEF12',
          network: NetworksEnum.polygonMainnet,
          votingPower: '2000000000000000000', // 2 tokens
          blockNumber: 2234567,
        },
        // This one should be skipped (votingPower is "0")
        {
          address: '0x4444567890AbCdef1234567890abcDef12345678',
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '0',
          blockNumber: 1234569,
        },
        // This one should be skipped (no tokenAddress)
        {
          address: '0x5554567890aBCdeF1234567890AbCdEf12345678',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
          tokenAddress: null,
        },
      ]

      // Prepare MemberMetric data (old structure with activity timestamps)
      const mockMemberMetrics = [
        {
          memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
          pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
          network: NetworksEnum.ethereumMainnet,
          firstActivity: 1000000000,
          lastActivity: 1234567899,
        },
        {
          memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
          pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
          network: NetworksEnum.ethereumMainnet,
          firstActivity: 1100000000,
          lastActivity: 1234567900,
        },
        {
          memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
          pluginAddress: '0xPlugin2234567890AbCdef1234567890ABcdEF2',
          network: NetworksEnum.polygonMainnet,
          firstActivity: 1200000000,
          lastActivity: 2234567899,
        },
      ]

      // Create DAOs
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumMainnet}-0xDao1234567890ABcdeF1234567890AbcDef1234`,
        address: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test Token DAO 1',
        blockNumber: 1000,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      await Models.Dao.create({
        id: `${NetworksEnum.polygonMainnet}-0xDao2234567890AbCdef1234567890ABcdEF1234`,
        address: '0xDao2234567890AbCdef1234567890ABcdEF1234',
        network: NetworksEnum.polygonMainnet,
        name: 'Test Token DAO 2',
        blockNumber: 2000,
        blockTimestamp: Date.now(),
        transactionHash: '0x456',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      // Create plugins (token voting plugins)
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0xPlugin1234567890ABcdeF1234567890AbcDef1`,
        address: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12', // Has token
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 1001,
        blockTimestamp: Date.now(),
        transactionHash: '0x789',
      })

      await Models.Plugin.create({
        id: `${NetworksEnum.polygonMainnet}-0xPlugin2234567890AbCdef1234567890ABcdEF2`,
        address: '0xPlugin2234567890AbCdef1234567890ABcdEF2',
        daoAddress: '0xDao2234567890AbCdef1234567890ABcdEF1234',
        network: NetworksEnum.polygonMainnet,
        tokenAddress: '0xToken2234567890AbCdef1234567890ABcdEF12', // Has token
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 2001,
        blockTimestamp: Date.now(),
        transactionHash: '0xabc',
      })

      // Create Token for testing
      await Models.Token.create({
        id: `${NetworksEnum.ethereumMainnet}-0xToken1234567890ABcdeF1234567890AbcDef12`,
        address: '0xToken1234567890ABcdeF1234567890AbcDef12',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test Token 1',
        symbol: 'TEST1',
        decimals: 18,
        type: ITokenType.ERC20,
      })

      await Models.Token.create({
        id: `${NetworksEnum.polygonMainnet}-0xToken2234567890AbCdef1234567890ABcdEF12`,
        address: '0xToken2234567890AbCdef1234567890ABcdEF12',
        network: NetworksEnum.polygonMainnet,
        name: 'Test Token 2',
        symbol: 'TEST2',
        decimals: 18,
        type: ITokenType.ERC20,
      })

      // Insert old data into collections
      await mongoose.connection.collection('MemberBalance').insertMany(mockMemberBalances)
      await mongoose.connection.collection('MemberMetric').insertMany(mockMemberMetrics)

      // Create Proposals and Votes to test that counts are calculated correctly
      // Member 1 created 2 proposals
      await Models.Proposal.create({
        transactionHash: '0xaaa',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
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
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        proposalIndex: '1',
        creatorAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 2,
        proposalId: '0x02',
      })

      // Member 2 created 1 proposal
      await Models.Proposal.create({
        transactionHash: '0xccc',
        blockNumber: 1002,
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        proposalIndex: '2',
        creatorAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        startDate: 1670000000,
        endDate: 1680000000,
        incrementalId: 3,
        proposalId: '0x03',
      })

      // Member 1 voted 5 times
      const votes1 = Array.from({ length: 5 }, (_, i) => ({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
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

      // Member 2 voted 3 times
      const votes2 = Array.from({ length: 3 }, (_, i) => ({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        proposalId: '0x01',
        voteOption: 1,
        votingPower: '500000000000000000',
        blockNumber: 3000 + i,
        transactionHash: `0xvote2${i}`,
        transactionIndex: i + 10,
        logIndex: (i + 10) * 2,
      }))
      await Promise.all(votes2.map(vote => Models.Vote.create(vote)))

      // Run migration
      await tokenMembersMigration.start()

      // VERIFY MIGRATION RESULTS

      // 1. Check Member collection - should have 3 unique members (excluding votingPower=0 and no tokenAddress)
      const members = await Models.Member.find({})

      // The migration processes members with voting power != 0 and tokenAddress exists
      // So we expect 3 members (excluding the one with votingPower=0 and the one with no tokenAddress)
      expect(members.length).to.equal(3)

      const memberAddresses = members.map((m: any) => m.address.toLowerCase()).sort()
      expect(memberAddresses).to.deep.equal([
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x2234567890abcdef1234567890abcdef12345678',
        '0x3334567890abcdef1234567890abcdef12345678',
      ])

      // 2. Check TokenMember collection - should have 3 entries
      const tokenMembers = await Models.TokenMember.find({})
      expect(tokenMembers.length).to.equal(3)

      // Verify first member's token membership
      const tokenMember1 = await Models.TokenMember.findOne({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
      })
      expect(tokenMember1).to.exist
      expect(tokenMember1?.votingPower).to.equal('1000000000000000000')
      expect(tokenMember1?.network).to.equal(NetworksEnum.ethereumMainnet)

      // Verify second member's token membership
      const tokenMember2 = await Models.TokenMember.findOne({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
      })
      expect(tokenMember2).to.exist
      expect(tokenMember2?.votingPower).to.equal('500000000000000000')

      // Verify third member's token membership (different token)
      const tokenMember3 = await Models.TokenMember.findOne({
        memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
        tokenAddress: '0xToken2234567890AbCdef1234567890ABcdEF12',
      })
      expect(tokenMember3).to.exist
      expect(tokenMember3?.votingPower).to.equal('2000000000000000000')
      expect(tokenMember3?.network).to.equal(NetworksEnum.polygonMainnet)

      // 3. Check PluginMetrics collection
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(3)

      // Verify metrics for member 1 (has MemberMetric data + proposals/votes)
      const metrics1 = await Models.PluginMetrics.findOne({
        memberAddress: '0x1234567890AbcdEF1234567890aBcdef12345678',
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
      })
      expect(metrics1).to.exist
      expect(metrics1?.lastActivity).to.equal(1234567899)
      expect(metrics1?.firstActivity).to.equal(1000000000)
      expect(metrics1?.proposalCount).to.equal(2) // Created 2 proposals
      expect(metrics1?.voteCount).to.equal(5) // Voted 5 times

      // Verify metrics for member 2 (has MemberMetric data + proposals/votes)
      const metrics2 = await Models.PluginMetrics.findOne({
        memberAddress: '0x2234567890abCdEF1234567890AbcDEf12345678',
        pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
      })
      expect(metrics2).to.exist
      expect(metrics2?.lastActivity).to.equal(1234567900)
      expect(metrics2?.firstActivity).to.equal(1100000000)
      expect(metrics2?.proposalCount).to.equal(1) // Created 1 proposal
      expect(metrics2?.voteCount).to.equal(3) // Voted 3 times

      // Verify metrics for member 3
      const metrics3 = await Models.PluginMetrics.findOne({
        memberAddress: '0x3334567890AbcDEF1234567890ABcdEF12345678',
        pluginAddress: '0xPlugin2234567890AbCdef1234567890ABcdEF2',
      })
      expect(metrics3).to.exist
      expect(metrics3?.lastActivity).to.equal(2234567899)
      expect(metrics3?.firstActivity).to.equal(1200000000)
      expect(metrics3?.proposalCount).to.equal(0) // No proposals
      expect(metrics3?.voteCount).to.equal(0) // No votes

      // Test the MemberController query to ensure it returns the correct members for token-based governance
      const queryMembers = await MemberController.getMembersWithPagination(
        {
          page: 1,
          limit: 100,
          sort: 'votingPower',
          order: 'desc',
        },
        {
          pluginAddress: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
          daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
          network: NetworksEnum.ethereumMainnet,
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
        },
      )

      // Expect to have 2 members for this token (member 1 and member 2)
      // Member 3 belongs to a different token on a different network
      expect(queryMembers.data.length).to.equal(2)

      // Verify the members are the correct ones
      const queriedAddresses = queryMembers.data.map((m: any) => m.address.toLowerCase()).sort()
      expect(queriedAddresses).to.deep.equal([
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x2234567890abcdef1234567890abcdef12345678',
      ])

      // Verify member 1 metrics from the query
      const member1Data = queryMembers.data.find((m: any) => m.address.toLowerCase() === '0x1234567890abcdef1234567890abcdef12345678')
      expect(member1Data).to.exist
      expect(member1Data?.votingPower).to.equal('1000000000000000000')
      expect(member1Data?.metrics.proposalCount).to.equal(2)
      expect(member1Data?.metrics.voteCount).to.equal(5)

      // Verify member 2 metrics from the query
      const member2Data = queryMembers.data.find((m: any) => m.address.toLowerCase() === '0x2234567890abcdef1234567890abcdef12345678')
      expect(member2Data).to.exist
      expect(member2Data?.votingPower).to.equal('500000000000000000')
      expect(member2Data?.metrics.proposalCount).to.equal(1)
      expect(member2Data?.metrics.voteCount).to.equal(3)
    })

    it('should update members with voting power mismatch from last transaction', async () => {
      const mockMemberBalances = [
        {
          address: '0x1234567890AbcdEF1234567890aBcdef12345678',
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
          blockNumber: 1234567,
        },
      ]

      const mockMemberTransaction = {
        address: '0x1234567890AbcdEF1234567890aBcdef12345678',
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
        network: NetworksEnum.ethereumMainnet,
        memberVotingPower: '2000000000000000000', // Different voting power
        votingPower: '2000000000000000000', // This will be used to update
        blockNumber: 1234568,
      }

      // Create minimal data needed
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumMainnet}-0xDao1234567890ABcdeF1234567890AbcDef1234`,
        address: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test Token DAO',
        blockNumber: 1000,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0xPlugin1234567890ABcdeF1234567890AbcDef1`,
        address: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 1001,
        blockTimestamp: Date.now(),
        transactionHash: '0x789',
      })

      await mongoose.connection.collection('MemberBalance').insertMany(mockMemberBalances)
      await mongoose.connection.collection('MemberTransaction').insertOne(mockMemberTransaction)

      // Run migration
      await tokenMembersMigration.start()

      // Verify member was NOT skipped - voting power was updated from transaction
      const members = await Models.Member.find({})
      expect(members.length).to.equal(1)

      const tokenMembers = await Models.TokenMember.find({})
      expect(tokenMembers.length).to.equal(1)

      // Verify voting power was updated to match the transaction
      const tokenMember = tokenMembers[0]
      expect(tokenMember.votingPower).to.equal('2000000000000000000') // Updated from transaction
      expect(tokenMember.lastVPBlockNumber).to.equal(1234568) // Updated block number

      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(1)
    })

    it('should handle errors gracefully and continue processing', async () => {
      // Create test data with checksummed addresses
      const mockMemberBalances = [
        {
          address: '0x1234567890AbcdEF1234567890aBcdef12345678',
          tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
          network: NetworksEnum.ethereumMainnet,
          votingPower: '1000000000000000000',
          blockNumber: 1234567,
        },
        {
          address: '0x2234567890abCdEF1234567890AbcDEf12345678',
          tokenAddress: '0xToken2234567890AbCdef1234567890ABcdEF12',
          network: NetworksEnum.polygonMainnet,
          votingPower: '500000000000000000',
          blockNumber: 2234567,
        },
      ]

      // Create DAOs with checksummed addresses
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumMainnet}-0xDao1234567890ABcdeF1234567890AbcDef1234`,
        address: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        name: 'Test Token DAO 1',
        blockNumber: 1000,
        blockTimestamp: Date.now(),
        transactionHash: '0x123',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      await Models.Dao.create({
        id: `${NetworksEnum.polygonMainnet}-0xDao2234567890AbCdef1234567890ABcdEF1234`,
        address: '0xDao2234567890AbCdef1234567890ABcdEF1234',
        network: NetworksEnum.polygonMainnet,
        name: 'Test Token DAO 2',
        blockNumber: 2000,
        blockTimestamp: Date.now(),
        transactionHash: '0x456',
        creatorAddress: '0x0000000000000000000000000000000000000000',
      })

      // Only create one plugin (second document will error due to missing plugin)
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumMainnet}-0xPlugin1234567890ABcdeF1234567890AbcDef1`,
        address: '0xPlugin1234567890ABcdeF1234567890AbcDef1',
        daoAddress: '0xDao1234567890ABcdeF1234567890AbcDef1234',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xToken1234567890ABcdeF1234567890AbcDef12',
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        blockNumber: 1001,
        blockTimestamp: Date.now(),
        transactionHash: '0x789',
      })

      await mongoose.connection.collection('MemberBalance').insertMany(mockMemberBalances)

      // Run migration
      await tokenMembersMigration.start()

      // Both members should be created regardless of plugin presence
      const members = await Models.Member.find({})
      expect(members.length).to.equal(2)

      // Both documents should have TokenMember (TokenMember is created regardless of plugin presence)
      const tokenMembers = await Models.TokenMember.find({})
      expect(tokenMembers.length).to.equal(2)

      // Only first document should have PluginMetrics (second has no plugin)
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(1)
      expect(pluginMetrics[0].memberAddress.toLowerCase()).to.equal('0x1234567890abcdef1234567890abcdef12345678')

      // Check completion log
      const loggerInfo = logger.info as sinon.SinonStub
      const completionLogCall = loggerInfo.getCalls().find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
      expect(completionLogCall?.args[1].totalProcessed).to.equal(2) // Both processed despite no plugin for second
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await tokenMembersMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })
})
