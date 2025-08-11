import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import LockManagerHandler from '@handlers/lockManagerHandler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import { ProxyMember } from '@modules/proxyMember'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NetworksEnum, EnumQueueName } from '@types'
import LockToVoteHelper from '@helpers/lockToVoteHelper'

describe.only('Indexer: LockManagerHandler', () => {
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

    it('should create new plugin member when member does not exist', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockPluginMember = {
        id: 'member-id-123',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '0',
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const verboseStub = sandbox.stub(logger, 'verbose')
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves()
      const getOrCreatePluginMemberStub = sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockPluginMember)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(mockParsedEvent.args.voter)).to.be.true
      
      expect(getOrCreatePluginMemberStub.calledOnce).to.be.true
      expect(getOrCreatePluginMemberStub.calledWith({
        memberAddress: mockParsedEvent.args.voter,
        daoAddress: mockPlugin.daoAddress,
        pluginAddress: mockPlugin.address,
        network: mockPlugin.network,
      })).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true
        
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledWith(
        mockPluginMember,
        { votingPower: '1000000000000000000' },
        mockLogInfo,
        'Update LockManager Member'
      )).to.be.true
      
      expect(updatePluginMetricsStub.calledOnce).to.be.true
      expect(updatePluginMetricsStub.calledWith({
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        network: mockPlugin.network,
        lastActivity: mockLogInfo.blockNumber,
      })).to.be.true
      
      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin.daoAddress,
          params: { address: mockPlugin.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true

      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should update existing plugin member when member exists with cumulative balance', async () => {
      const mockPlugin = {
        address: '0xplugin456',
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockExistingMember = {
        id: 'member-id-456',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '500000000000000000',
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User locked another 1000, so total is now 1500
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1500000000000000000')
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockExistingMember)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledWith(
        mockExistingMember,
        { votingPower: '1500000000000000000' },
        mockLogInfo,
        'Update LockManager Member'
      )).to.be.true
      
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should handle case when plugin is not found', async () => {
      const warnStub = sandbox.stub(logger, 'warn')
      const findPluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const getOrCreatePluginMemberStub = sandbox.stub(ProxyMember, 'getOrCreatePluginMember')

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(getOrCreatePluginMemberStub.notCalled).to.be.true
      expect(warnStub.calledWith('BalanceLocked - Plugin not found' as any)).to.be.true
    })


    it('should use fallback when getUserLockedBalance returns null for new member', async () => {
      const mockPlugin = {
        address: '0xplugin999',
        daoAddress: '0xdao999',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockPluginMember = {
        id: 'member-id-999',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: undefined, // New member has no voting power yet
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockPluginMember)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should use event amount as initial voting power
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledWith(
        mockPluginMember,
        { votingPower: '1000000000000000000' },
        mockLogInfo,
        'Update LockManager Member'
      )).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null for existing member', async () => {
      const mockPlugin = {
        address: '0xplugin888',
        daoAddress: '0xdao888',
        network: NetworksEnum.ethereumMainnet,
      }

      const existingMember = {
        id: 'member-id-888',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '500000000000000000',
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(existingMember)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
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

    it('should update plugin member to zero voting power when unlocking all balance', async () => {
      const mockPlugin = {
        address: '0xplugin789',
        daoAddress: '0xdao789',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockExistingMember = {
        id: 'member-id-789',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '1000000000000000000',
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User unlocked all tokens, so balance is now 0
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockExistingMember)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledWith(
        mockExistingMember,
        { votingPower: '0' },
        mockLogInfo,
        'Update LockManager Member'
      )).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true

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
      const mockPlugin = {
        address: '0xplugin999',
        daoAddress: '0xdao999',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockExistingMember = {
        id: 'member-id-999b',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '2000000000000000000',
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User unlocked 1000 tokens, but still has 1000 tokens locked
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockExistingMember)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledWith(
        mockExistingMember,
        { votingPower: '1000000000000000000' },
        mockLogInfo,
        'Update LockManager Member'
      )).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance unlocked successfully' as any)).to.be.true
    })

    it('should handle case when plugin is not found', async () => {
      const warnStub = sandbox.stub(logger, 'warn')
      const findPluginStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const getOrCreatePluginMemberStub = sandbox.stub(ProxyMember, 'getOrCreatePluginMember')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(getOrCreatePluginMemberStub.notCalled).to.be.true
      expect(warnStub.calledWith('BalanceUnlocked - Plugin not found' as any)).to.be.true
    })

    it('should handle error when member has no voting power', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
        network: NetworksEnum.ethereumMainnet,
      }

      const mockPluginMember = {
        id: 'member-id-123b',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: undefined, // Member has no voting power
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(mockPluginMember)
      sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateDocumentStub.notCalled).to.be.true
      expect(errorStub.calledWith('Error remove votingPower to not pre exiting one' as any)).to.be.true
    })


    it('should use fallback when getUserLockedBalance returns null', async () => {
      const mockPlugin = {
        address: '0xplugin777',
        daoAddress: '0xdao777',
        network: NetworksEnum.ethereumMainnet,
      }

      const existingMember = {
        id: 'member-id-777',
        memberAddress: mockParsedEvent.args.voter,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        network: mockPlugin.network,
        votingPower: '2000000000000000000', // Had 2000 tokens locked
        update: sandbox.stub(),
        reload: sandbox.stub(),
      } as any

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreatePluginMember').resolves(existingMember)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
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
