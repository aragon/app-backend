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
      expect(createdMember!.isActive).to.be.true

      expect(getBlockTimestampStub.calledOnce).to.be.true
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

    it('should update existing lock manager member when member exists', async () => {
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

      // Create existing member first
      await Models.LockManagerMember.create({
        network: mockLogInfo.network,
        pluginAddress: mockPlugin.address,
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '500000000000000000',
        transactionHash: '0xold123',
        blockNumber: 11111,
        blockTimestamp: 1619999999,
        isActive: true,
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify the member was updated in the database
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
      expect(updatedMember!.isActive).to.be.true

      expect(getBlockTimestampStub.calledOnce).to.be.true
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

    it('should deactivate lock manager member when unlocking balance', async () => {
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
        isActive: true,
      })

      const verboseStub = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
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
      expect(deactivatedMember!.isActive).to.be.false

      expect(getBlockTimestampStub.calledOnce).to.be.true
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
