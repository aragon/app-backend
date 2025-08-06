import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import LockManagerHandler from '@handlers/lockManagerHandler'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import DbOperations from '@models/utils/dbOperations'
import { ProxyMember } from '@modules/proxyMember'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NetworksEnum, EnumQueueName } from '@types'
import LockToVoteHelper from '@helpers/lockToVoteHelper'

describe('Indexer: LockManagerHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('balanceLocked', () => {
    const mockParsedEvent = {
      args: {
        voter: '0x1234567890123456789012345678901234567890',
        amount: { toString: () => '1000000000000000000' },
      },
    }

    const mockLogInfo = {
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345,
      transactionHash: '0xabcdef1234567890',
      address: '0x9876543210987654321098765432109876543210',
    }

    it('should create new lock manager member when member does not exist', async () => {
      const mockPlugin = await Models.Plugin.create({
        address: '0xplugin123',
        daoAddress: '0xdao123',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
        status: 'installed',
        blockNumber: 12345,
        transactionHash: '0xtest123',
        pluginSetupRepoAddress: '0xrepo123',
        interfaceType: 'tokenVoting',
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves()
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify the lock manager member was created in the database
      const createdMember = await Models.LockManagerMember.findMemberByPlugin({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
      })

      expect(createdMember).to.not.be.null
      expect(createdMember!.network).to.equal(mockLogInfo.network)
      expect(createdMember!.pluginAddress).to.equal(mockPlugin.address)
      expect(createdMember!.memberAddress).to.equal(mockParsedEvent.args.voter)
      expect(createdMember!.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(createdMember!.votingPower).to.equal('1000000000000000000')
      expect(createdMember!.transactionHash).to.equal(mockLogInfo.transactionHash)
      expect(createdMember!.blockNumber).to.equal(mockLogInfo.blockNumber)
      expect(createdMember!.blockTimestamp).to.equal(1620000000)
      // isActive field is no longer used

      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true
      expect(createMemberStub.calledOnce).to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(addToDaoStub.calledOnce).to.be.true
      expect(updateActivityStub.calledOnce).to.be.true
      expect(createMetricsStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin.daoAddress,
          params: { address: mockPlugin.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true

      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should update existing lock manager member when member exists with cumulative balance', async () => {
      const mockPlugin = await Models.Plugin.create({
        address: '0xplugin456',
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
        status: 'installed',
        blockNumber: 12345,
        transactionHash: '0xtest456',
        pluginSetupRepoAddress: '0xrepo456',
        interfaceType: 'tokenVoting',
      })

      // Create existing member first with initial lock of 500
      await Models.LockManagerMember.create({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '500000000000000000',
        transactionHash: '0xold123',
        blockNumber: 11111,
        blockTimestamp: 1619999999,
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      // User locked another 1000, so total is now 1500
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1500000000000000000')

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify the member was updated in the database
      const updatedMember = await Models.LockManagerMember.findMemberByPlugin({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
      })

      expect(updatedMember).to.not.be.null
      // Should now have cumulative voting power of 1500
      expect(updatedMember!.votingPower).to.equal('1500000000000000000')
      expect(updatedMember!.transactionHash).to.equal(mockLogInfo.transactionHash)
      expect(updatedMember!.blockNumber).to.equal(mockLogInfo.blockNumber)
      expect(updatedMember!.blockTimestamp).to.equal(1620000000)
      // isActive field is no longer used

      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should handle case when plugin is not found', async () => {
      const warnStub = sandbox.stub(logger, 'warn')
      const findPluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const findMemberStub = sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin')

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(findMemberStub.notCalled).to.be.true
      expect(warnStub.calledWith('BalanceLocked - Plugin not found' as any)).to.be.true
    })

    it('should handle case when member is already member of dao', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(Models.LockManagerMember, 'create').resolves()
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'createMetrics').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(addToDaoStub.notCalled).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null for new member', async () => {
      const mockPlugin = {
        address: '0xplugin999',
        daoAddress: '0xdao999',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      const createStub = sandbox.stub(Models.LockManagerMember, 'create').resolves()
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'createMetrics').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should use event amount as initial voting power
      const createCall = createStub.getCall(0)
      expect(createCall.args[0].votingPower).to.equal('1000000000000000000')
    })

    it('should use fallback when getUserLockedBalance returns null for existing member', async () => {
      const mockPlugin = {
        address: '0xplugin888',
        daoAddress: '0xdao888',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
      }

      const existingMember = {
        votingPower: '500000000000000000',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(existingMember)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should add event amount to existing voting power (500 + 1000 = 1500)
      const updateCall = updateStub.getCall(0)
      expect(updateCall.args[1].votingPower).to.equal('1500000000000000000')
    })

    it('should handle errors and log them', async () => {
      const error = new Error('Database error')
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(error)

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error BalanceLocked' as any)).to.be.true
    })
  })

  describe('balanceUnlocked', () => {
    const mockParsedEvent = {
      args: {
        voter: '0x1234567890123456789012345678901234567890',
        amount: { toString: () => '1000000000000000000' },
      },
    }

    const mockLogInfo = {
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345,
      transactionHash: '0xabcdef1234567890',
      address: '0x9876543210987654321098765432109876543210',
    }

    it('should deactivate lock manager member when unlocking all balance', async () => {
      const mockPlugin = await Models.Plugin.create({
        address: '0xplugin789',
        daoAddress: '0xdao789',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
        status: 'installed',
        blockNumber: 12345,
        transactionHash: '0xtest789',
        pluginSetupRepoAddress: '0xrepo789',
        interfaceType: 'tokenVoting',
      })

      // Create existing active member first
      await Models.LockManagerMember.create({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '1000000000000000000',
        transactionHash: '0xold789',
        blockNumber: 11111,
        blockTimestamp: 1619999999,
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      // User unlocked all tokens, so balance is now 0
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify the member was deactivated in the database
      const deactivatedMember = await Models.LockManagerMember.findMemberByPlugin({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
      })

      expect(deactivatedMember).to.not.be.null
      expect(deactivatedMember!.votingPower).to.equal('0')
      expect(deactivatedMember!.transactionHash).to.equal(mockLogInfo.transactionHash)
      expect(deactivatedMember!.blockNumber).to.equal(mockLogInfo.blockNumber)
      expect(deactivatedMember!.blockTimestamp).to.equal(1620000000)
      // Member should have 0 voting power when all tokens unlocked

      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(removeFromDaoStub.calledOnce).to.be.true

      const expectedMembershipParams = {
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
      }
      expect(removeFromDaoStub.calledWith(expectedMembershipParams)).to.be.true

      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin.daoAddress,
          params: { address: mockPlugin.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true

      expect(verboseStub.calledWith('Balance unlocked successfully' as any)).to.be.true
    })

    it('should update member with remaining balance when partially unlocking', async () => {
      const mockPlugin = await Models.Plugin.create({
        address: '0xplugin999',
        daoAddress: '0xdao999',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
        status: 'installed',
        blockNumber: 12345,
        transactionHash: '0xtest999',
        pluginSetupRepoAddress: '0xrepo999',
        interfaceType: 'tokenVoting',
      })

      // Create existing active member with 2000 tokens locked
      await Models.LockManagerMember.create({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '2000000000000000000',
        transactionHash: '0xold999',
        blockNumber: 11111,
        blockTimestamp: 1619999999,
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      // User unlocked 1000 tokens, but still has 1000 tokens locked
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao')
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify the member was updated but still active
      const updatedMember = await Models.LockManagerMember.findMemberByPlugin({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
      })

      expect(updatedMember).to.not.be.null
      expect(updatedMember!.votingPower).to.equal('1000000000000000000')
      expect(updatedMember!.transactionHash).to.equal(mockLogInfo.transactionHash)
      expect(updatedMember!.blockNumber).to.equal(mockLogInfo.blockNumber)
      expect(updatedMember!.blockTimestamp).to.equal(1620000000)
      // Member should still have voting power

      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      // Should NOT remove from DAO since member still has tokens locked
      expect(isMemberOfDaoStub.notCalled).to.be.true
      expect(removeFromDaoStub.notCalled).to.be.true

      expect(sendMessageStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance unlocked successfully' as any)).to.be.true
    })

    it('should handle case when plugin is not found', async () => {
      const warnStub = sandbox.stub(logger, 'warn')
      const findPluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const findMemberStub = sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(findMemberStub.notCalled).to.be.true
      expect(warnStub.calledWith('BalanceUnlocked - Plugin not found' as any)).to.be.true
    })

    it('should handle case when member is not found', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
      }

      const warnStub = sandbox.stub(logger, 'warn')
      const findPluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const findMemberStub = sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(null)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(findMemberStub.calledOnce).to.be.true
      expect(updateDocumentStub.notCalled).to.be.true
      expect(warnStub.calledWith('BalanceUnlocked - Member not found' as any)).to.be.true
    })

    it('should handle case when member is not member of dao', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
      }

      const mockExistingMember = {
        id: 'member123',
        votingPower: '1000000000000000000',
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(mockExistingMember)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      sandbox.stub(DbOperations, 'updateDocument').resolves()
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(removeFromDaoStub.notCalled).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null', async () => {
      const mockPlugin = {
        address: '0xplugin777',
        daoAddress: '0xdao777',
        network: NetworksEnum.ethereumMainnet,
        lockManagerAddress: mockLogInfo.address,
      }

      const existingMember = {
        votingPower: '2000000000000000000', // Had 2000 tokens locked
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(Models.LockManagerMember, 'findMemberByPlugin').resolves(existingMember)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith(
          'BalanceUnlocked - Failed to get locked balance from contract, using fallback subtraction' as any,
        ),
      ).to.be.true
      // Should subtract event amount from existing voting power (2000 - 1000 = 1000)
      const updateCall = updateStub.getCall(0)
      expect(updateCall.args[1].votingPower).to.equal('1000000000000000000')
      // Should NOT remove from DAO since still has tokens locked
      expect(isMemberOfDaoStub.notCalled).to.be.true
      expect(removeFromDaoStub.notCalled).to.be.true
    })

    it('should handle errors and log them', async () => {
      const error = new Error('Database error')
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(error)

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error BalanceUnlocked' as any)).to.be.true
    })
  })
})
