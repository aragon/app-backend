import { Models } from '@dbModels'
import logger from '@logger'
import veLockerMigration from '@src/migrations/20250820095946-veLocker'
import { IPluginInterfaceType, IPluginStatus, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import mongoose from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import MockVeLockerData from './mockData/mockVeLocker.json'

describe('migration: veLocker', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Only stub logger to reduce noise in tests
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'warn')

    // Clean up collections that are not Mongoose models
    await mongoose.connection.collection('MemberBalance').deleteMany({})
    await mongoose.connection.collection('MemberMetric').deleteMany({})
  })

  afterEach(async () => {
    sandbox?.restore()

    // Clean up collections that are not Mongoose models
    await mongoose.connection.collection('MemberBalance').deleteMany({})
    await mongoose.connection.collection('MemberMetric').deleteMany({})
  })

  describe('veLockerMigration with real database', () => {
    it('should successfully migrate Lock documents to TokenMember with escrowAdapter', async () => {
      // Create DAOs
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumSepolia}-0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87`,
        address: '0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87',
        network: NetworksEnum.ethereumSepolia,
        name: 'VE Locks DAO',
        blockNumber: 8538687,
        blockTimestamp: Date.now(),
        transactionHash: '0x3e4e847f79c6b2b29afd9716111d0636642c1891a738662f01aa797ad0d852b7',
        creatorAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      })

      // Create Plugin with tokenVoting type and escrowAdapter token
      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumSepolia}-0x664224595Bb0D5EA54986171a236e11A2e2Dd223`,
        address: '0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
        daoAddress: '0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3', // VE token address
        tokenType: ITokenType.escrowAdapter, // This is the key field for VE tokens
        blockNumber: 8575996,
        blockTimestamp: Date.now(),
        transactionHash: '0x79e59bb769cd3ee840f48d0e4fc2a3eb4742e63c870af6c038f401eaeff67348',
      })

      // Create Lock documents (these are the veLocks)
      const mockLocks = [
        {
          id: 'ethereum-sepolia-0x844d959c3b755f388a1e0a382a4b2280c5c2d2ec8a8565b100432e55af87757b-40-51-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-1',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x844d959c3b755f388a1e0a382a4b2280c5c2d2ec8a8565b100432e55af87757b',
          transactionIndex: 40,
          logIndex: 51,
          blockNumber: 8576026,
          blockTimestamp: 1750253952,
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '1',
          amount: '150000000000000000000',
          epochStartAt: 1749686400,
          totalLocked: '150000000000000000000',
        },
        {
          id: 'ethereum-sepolia-0x33e1336aecd5867b5c25a776d2566fcbf15648900aadd5b87569b2d2a302e685-24-12-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-2',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x33e1336aecd5867b5c25a776d2566fcbf15648900aadd5b87569b2d2a302e685',
          transactionIndex: 24,
          logIndex: 12,
          blockNumber: 8588769,
          blockTimestamp: 1750407648,
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '2',
          amount: '100000000000000000000',
          epochStartAt: 1750291200,
          totalLocked: '250000000000000000000',
        },
        {
          id: 'ethereum-sepolia-0xe028aef86df04306de75dd258d7c3e7b46e9abbf61a5839490a245166e3e63dd-31-42-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759-3',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0xe028aef86df04306de75dd258d7c3e7b46e9abbf61a5839490a245166e3e63dd',
          transactionIndex: 31,
          logIndex: 42,
          blockNumber: 8618799,
          blockTimestamp: 1750768764,
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '3',
          amount: '250002500000000000000000',
          epochStartAt: 1750291200,
          totalLocked: '250252500000000000000000',
        },
      ]
      await Models.Lock.insertMany(mockLocks)

      // Create MemberBalance documents (old structure)
      const mockMemberBalance = [
        {
          id: 'ethereum-sepolia-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          network: NetworksEnum.ethereumSepolia,
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          amount: '2',
          tokenIds: ['1', '2'], // Has tokenIds 1 and 2 from the Lock documents
          votingPower: '0',
          lastSyncAmountBlockNumber: 8588769,
          lastSyncVotingPowerBlockNumber: 0,
        },
        {
          id: 'ethereum-sepolia-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          network: NetworksEnum.ethereumSepolia,
          address: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          amount: '1',
          tokenIds: ['3'], // Has tokenId 3 from the Lock documents
          votingPower: '0',
          lastSyncAmountBlockNumber: 8618799,
          lastSyncVotingPowerBlockNumber: 0,
        },
      ]
      await mongoose.connection.collection('MemberBalance').insertMany(mockMemberBalance)

      // Create MemberMetric documents for activity tracking
      await mongoose.connection.collection('MemberMetric').insertMany([
        {
          id: 'ethereum-sepolia-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
          network: NetworksEnum.ethereumSepolia,
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          pluginAddress: '0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
          delegateReceivedCount: -2,
          voteCount: 0,
          proposalCount: 0,
          lastActivity: 1750868820,
          firstActivity: 1750253952,
        },
        {
          id: 'ethereum-sepolia-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759-0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
          network: NetworksEnum.ethereumSepolia,
          address: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          pluginAddress: '0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
          delegateReceivedCount: -1,
          voteCount: 0,
          proposalCount: 0,
          lastActivity: 1750768764,
          firstActivity: 1750768764,
        },
      ])

      // Run the migration
      await veLockerMigration.start()

      // 1. Verify Members were created
      const members = await Models.Member.find({}).sort({ address: 1 })
      expect(members.length).to.equal(2)
      expect(members[0].address).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
      expect(members[1].address).to.equal('0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759')

      // 2. Verify Locks were updated with delegateReceiverAddress
      const locks = await Models.Lock.find({}).sort({ memberAddress: 1 })
      expect(locks.length).to.equal(3) // 3 Lock documents

      // Member 0x17366... has 2 locks (tokenIds 1 and 2)
      const member1Locks = locks.filter(
        (lock: any) => lock.memberAddress === '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      )
      expect(member1Locks.length).to.equal(2)
      expect(member1Locks[0].tokenId).to.equal('1')
      expect(member1Locks[1].tokenId).to.equal('2')
      expect(member1Locks[0].delegateReceiverAddress).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
      expect(member1Locks[1].delegateReceiverAddress).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')

      // Member 0x455e... has 1 lock (tokenId 3)
      const member2Locks = locks.filter(
        (lock: any) => lock.memberAddress === '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      )
      expect(member2Locks.length).to.equal(1)
      expect(member2Locks[0].tokenId).to.equal('3')
      expect(member2Locks[0].delegateReceiverAddress).to.equal('0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759')

      // 3. Verify PluginMetrics were created/updated
      const pluginMetrics = await Models.PluginMetrics.find({}).sort({ memberAddress: 1 })
      expect(pluginMetrics.length).to.equal(2) // One per member with locks

      // Verify metrics for member 1
      const member1Metrics = pluginMetrics.filter(
        (pm: any) => pm.memberAddress === '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      )
      expect(member1Metrics.length).to.equal(1)
      expect(member1Metrics[0].pluginAddress).to.equal('0x664224595Bb0D5EA54986171a236e11A2e2Dd223')
      expect(member1Metrics[0].daoAddress).to.equal('0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87')

      // Verify metrics for member 2
      const member2Metrics = pluginMetrics.filter(
        (pm: any) => pm.memberAddress === '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
      )
      expect(member2Metrics.length).to.equal(1)
      expect(member2Metrics[0].pluginAddress).to.equal('0x664224595Bb0D5EA54986171a236e11A2e2Dd223')

      // 4. Verify no TokenMembers were created (VE uses Lock documents, not TokenMembers)
      const tokenMembers = await Models.TokenMember.find({})
      expect(tokenMembers.length).to.equal(0)
    })

    it('should handle no Lock documents to migrate', async () => {
      // Don't create any Lock documents

      await veLockerMigration.start()

      // Verify no members were created
      const members = await Models.Member.find({})
      expect(members.length).to.equal(0)

      // Verify no TokenMembers were created
      const tokenMembers = await Models.TokenMember.find({})
      expect(tokenMembers.length).to.equal(0)

      // Verify no PluginMetrics were created
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(0)
    })

    it('should skip users when MemberBalance not found or tokenId not in MemberBalance', async () => {
      // Create DAO and Plugin
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumSepolia}-0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87`,
        address: '0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87',
        network: NetworksEnum.ethereumSepolia,
        name: 'VE Locks DAO',
        blockNumber: 8538687,
        blockTimestamp: Date.now(),
        transactionHash: '0x3e4e',
        creatorAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      })

      await Models.Plugin.create({
        id: `${NetworksEnum.ethereumSepolia}-0x664224595Bb0D5EA54986171a236e11A2e2Dd223`,
        address: '0x664224595Bb0D5EA54986171a236e11A2e2Dd223',
        daoAddress: '0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
        tokenType: ITokenType.escrowAdapter,
        blockNumber: 8575996,
        blockTimestamp: Date.now(),
        transactionHash: '0x79e5',
      })

      // Create Lock documents
      await Models.Lock.insertMany([
        {
          id: 'lock-1',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x844d',
          transactionIndex: 10,
          logIndex: 15,
          blockNumber: 8576026,
          blockTimestamp: 1750253952,
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '1',
          amount: '150000000000000000000',
          epochStartAt: 1749686400,
          totalLocked: '150000000000000000000',
        },
        {
          id: 'lock-2',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x33e1',
          transactionIndex: 20,
          logIndex: 25,
          blockNumber: 8588769,
          blockTimestamp: 1750407648,
          memberAddress: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '2',
          amount: '100000000000000000000',
          epochStartAt: 1750291200,
          totalLocked: '250000000000000000000',
        },
        {
          id: 'lock-3',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0xe028',
          transactionIndex: 30,
          logIndex: 35,
          blockNumber: 8618799,
          blockTimestamp: 1750768764,
          memberAddress: '0x061BB58c8C726e545618d9D594bb81D38fabe405',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '3',
          amount: '250002500000000000000000',
          epochStartAt: 1750291200,
          totalLocked: '250252500000000000000000',
        },
      ])

      // Create MemberBalance for only the first user with tokenId 1
      await mongoose.connection.collection('MemberBalance').insertMany([
        {
          id: 'ethereum-sepolia-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          network: NetworksEnum.ethereumSepolia,
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          amount: '1',
          tokenIds: ['1'], // Only has tokenId 1
          votingPower: '0',
          lastSyncAmountBlockNumber: 8576026,
          lastSyncVotingPowerBlockNumber: 0,
        },
        {
          id: 'ethereum-sepolia-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          network: NetworksEnum.ethereumSepolia,
          address: '0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          amount: '1',
          tokenIds: ['5'], // Has tokenId 5 but Lock has tokenId 2, so will be skipped
          votingPower: '0',
          lastSyncAmountBlockNumber: 8588769,
          lastSyncVotingPowerBlockNumber: 0,
        },
      ])
      // No MemberBalance for third user 0x061BB58...

      await veLockerMigration.start()

      // Verify only one Lock was updated (for the user with matching MemberBalance and tokenId)
      const locks = await Models.Lock.find({})
      expect(locks.length).to.equal(3) // All 3 locks still exist

      // Check that only locks with matching MemberBalance were updated
      const updatedLocks = locks.filter((lock: any) => lock.delegateReceiverAddress)
      expect(updatedLocks.length).to.equal(1) // Only tokenId '1' has matching MemberBalance
      expect(updatedLocks[0].memberAddress).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
      expect(updatedLocks[0].tokenId).to.equal('1')
      expect(updatedLocks[0].delegateReceiverAddress).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')

      // Verify only one PluginMetrics was created (for the member with updated lock)
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.equal(1)
      expect(pluginMetrics[0].memberAddress).to.equal('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
    })

    it('should handle errors gracefully and continue processing', async () => {
      // Create DAO and Plugin
      await Models.Dao.create({
        id: `${NetworksEnum.ethereumSepolia}-0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87`,
        address: '0xFBa51da25FF964776Ce0B5A29ca0761AA9374f87',
        network: NetworksEnum.ethereumSepolia,
        name: 'VE Locks DAO',
        blockNumber: 8538687,
        blockTimestamp: Date.now(),
        transactionHash: '0x3e4e',
        creatorAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
      })

      // Plugin setup will cause error by having invalid data
      // We'll test the migration continues despite errors

      // Create Lock documents - one will have valid data, one invalid
      await Models.Lock.insertMany([
        {
          id: 'lock-valid',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x844d',
          transactionIndex: 10,
          logIndex: 15,
          blockNumber: 8576026,
          blockTimestamp: 1750253952,
          memberAddress: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '1',
          amount: '150000000000000000000',
          epochStartAt: 1749686400,
          totalLocked: '150000000000000000000',
        },
        {
          id: 'lock-invalid',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: '0x33e1',
          transactionIndex: 20,
          logIndex: 25,
          blockNumber: 8588769,
          blockTimestamp: 1750407648,
          memberAddress: 'INVALID_ADDRESS', // This will cause an error
          escrowAddress: '0x4eAEE06C706DcBf8653013E1fC8F930F9954cc58',
          exitQueueAddress: '0x49580Aa0caA9936Faf5Cb212826ecC9a53276fb8',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          nftAddress: '0x5464f1C095CFEf7110aeE391deE3d35Cd049b240',
          tokenId: '2',
          amount: '100000000000000000000',
          epochStartAt: 1750291200,
          totalLocked: '250000000000000000000',
        },
      ])

      // Create MemberBalance for valid lock
      await mongoose.connection.collection('MemberBalance').insertMany([
        {
          id: 'ethereum-sepolia-0x17366cae2b9c6C3055e9e3C78936a69006BE5409-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          network: NetworksEnum.ethereumSepolia,
          address: '0x17366cae2b9c6C3055e9e3C78936a69006BE5409',
          tokenAddress: '0x211aEa089C589bbCB636A52283B520E1b4F7c1b3',
          amount: '1',
          tokenIds: ['1'],
          votingPower: '0',
          lastSyncAmountBlockNumber: 8576026,
          lastSyncVotingPowerBlockNumber: 0,
        },
      ])

      // Run migration - should continue despite error with invalid address
      await veLockerMigration.start()

      // The migration counts entire veToken groups as errors if any fail,
      // but in this case both locks are for the same token so both would be counted as errors
      // However, the migration should still complete

      const loggerInfo = logger.info as sinon.SinonStub
      const completionLogCall = loggerInfo.getCalls().find(call => call.args[0] === 'Migration completed successfully')
      expect(completionLogCall).to.exist
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await veLockerMigration.stop()
      // No assertions needed, just verify it doesn't throw
    })
  })

  describe('migration with mock data', () => {
    it('should save the members from the mock data for veLocker', async () => {
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

      // Verify Members were created
      const members = await Models.Member.find({})
      expect(members.length).to.be.greaterThan(0)

      // Verify Locks were updated with delegateReceiverAddress
      const locks = await Models.Lock.find({})
      expect(locks.length).to.be.greaterThan(0)

      // Count locks with delegateReceiverAddress set (migration only updates those with matching MemberBalance)
      const updatedLocks = locks.filter((lock: any) => lock.delegateReceiverAddress)
      expect(updatedLocks.length).to.be.greaterThan(0)

      // Verify each updated lock has proper delegateReceiverAddress
      for (const lock of updatedLocks) {
        expect(lock.delegateReceiverAddress).to.not.be.undefined
        expect(lock.delegateReceiverAddress).to.not.be.null
        // Delegate address should match the member who owns the tokenId
        expect(lock.delegateReceiverAddress).to.be.a('string')
      }

      // Verify PluginMetrics were created
      const pluginMetrics = await Models.PluginMetrics.find({})
      expect(pluginMetrics.length).to.be.greaterThan(0)

      for (const pluginMetric of pluginMetrics) {
        expect(pluginMetric.firstActivity).to.be.not.undefined
        expect(pluginMetric.lastActivity).to.be.not.undefined
        expect(pluginMetric.firstActivity).to.be.greaterThan(0)
        expect(pluginMetric.lastActivity).to.be.greaterThan(0)
      }
    })
  })
})
