import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import LockManagerHandler from '@handlers/lockManagerHandler'
import { Models } from '@dbModels'
import logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NetworksEnum, EnumQueueName } from '@types'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import utils from '@helpers/utils'

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

    it('should create member and update voting power when balance is locked', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const verboseStub = sandbox.stub(logger, 'verbose')
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves()
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      const getUniqueValuesByKeyStub = sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify createMember was called
      expect(createMemberStub.calledOnce).to.be.true
      expect(createMemberStub.calledWith(mockParsedEvent.args.voter, mockLogInfo.blockNumber)).to.be.true

      // Verify updateLockManagerMemberVP was called
      expect(updateLockManagerMemberVPStub.calledOnce).to.be.true
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1000000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      // Verify getUserLockedBalance was called
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true

      // Verify updatePluginMetrics was called
      expect(updatePluginMetricsStub.calledOnce).to.be.true
      expect(
        updatePluginMetricsStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin.address,
          network: mockPlugin.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      // Verify message was sent
      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin.daoAddress,
          params: { address: mockPlugin.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true

      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should update existing member voting power with cumulative balance', async () => {
      const mockPlugin = {
        address: '0xplugin456',
        daoAddress: '0xdao456',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User locked another 1000, so total is now 1500
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1500000000000000000')
      sandbox.stub(ProxyMember, 'createMember').resolves()
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateLockManagerMemberVPStub.calledOnce).to.be.true
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1500000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should handle case when plugins are not found', async () => {
      const findPluginStub = sandbox.stub(Models.Plugin, 'find').resolves([])
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP')

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(updateLockManagerMemberVPStub.notCalled).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null for new member', async () => {
      const mockPlugin = {
        address: '0xplugin999',
        daoAddress: '0xdao999',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreateLockManagerMember').resolves({
        votingPower: undefined, // New member has no voting power yet
      } as any)
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should use event amount as initial voting power
      expect(updateLockManagerMemberVPStub.calledOnce).to.be.true
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1000000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null for existing member', async () => {
      const mockPlugin = {
        address: '0xplugin888',
        daoAddress: '0xdao888',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'getOrCreateLockManagerMember').resolves({
        votingPower: '500000000000000000',
      } as any)
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should add event amount to existing voting power (500 + 1000 = 1500)
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1500000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true
    })

    it('should handle multiple plugins and send multiple messages', async () => {
      const mockPlugin1 = {
        address: '0xplugin1',
        daoAddress: '0xdao1',
        network: NetworksEnum.ethereumMainnet,
      }
      const mockPlugin2 = {
        address: '0xplugin2',
        daoAddress: '0xdao2',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin1, mockPlugin2])
      sandbox.stub(logger, 'verbose')
      sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('1000000000000000000')
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin1.daoAddress, mockPlugin2.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify updatePluginMetrics was called for both plugins
      expect(updatePluginMetricsStub.calledTwice).to.be.true
      expect(
        updatePluginMetricsStub.firstCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin1.address,
          network: mockPlugin1.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true
      expect(
        updatePluginMetricsStub.secondCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin2.address,
          network: mockPlugin2.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      // Verify messages were sent for both DAOs
      expect(sendMessageStub.calledTwice).to.be.true
      expect(
        sendMessageStub.firstCall.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin1.daoAddress,
          params: { address: mockPlugin1.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true
      expect(
        sendMessageStub.secondCall.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin2.daoAddress,
          params: { address: mockPlugin2.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true
    })

    it('should handle errors and log them', async () => {
      const error = new Error('Database error')
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'find').rejects(error)

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

    it('should update member to zero voting power when unlocking all balance', async () => {
      const mockPlugin = {
        address: '0xplugin789',
        daoAddress: '0xdao789',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User unlocked all tokens, so balance is now 0
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateLockManagerMemberVPStub.calledOnce).to.be.true
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '0',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true

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

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const verboseStub = sandbox.stub(logger, 'verbose')
      // User unlocked 1000 tokens, but still has 1000 tokens locked
      const getUserLockedBalanceStub = sandbox
        .stub(LockToVoteHelper, 'getUserLockedBalance')
        .resolves('1000000000000000000')
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateLockManagerMemberVPStub.calledOnce).to.be.true
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1000000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance unlocked successfully' as any)).to.be.true
    })

    it('should handle case when plugins are not found', async () => {
      const findPluginStub = sandbox.stub(Models.Plugin, 'find').resolves([])
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(updateLockManagerMemberVPStub.notCalled).to.be.true
    })

    it('should handle error when member has no voting power in fallback', async () => {
      const mockPlugin = {
        address: '0xplugin123',
        daoAddress: '0xdao123',
        network: NetworksEnum.ethereumMainnet,
      }

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'getOrCreateLockManagerMember').resolves({
        votingPower: undefined, // Member has no voting power
      } as any)
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(updateLockManagerMemberVPStub.notCalled).to.be.true
      expect(errorStub.calledWith('Error remove votingPower to not pre exiting one' as any)).to.be.true
    })

    it('should use fallback when getUserLockedBalance returns null', async () => {
      const mockPlugin = {
        address: '0xplugin777',
        daoAddress: '0xdao777',
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      const warnStub = sandbox.stub(logger, 'warn')
      const getUserLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      sandbox.stub(ProxyMember, 'getOrCreateLockManagerMember').resolves({
        votingPower: '2000000000000000000', // Had 2000 tokens locked
      } as any)
      const updateLockManagerMemberVPStub = sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith(
          'BalanceUnlocked - Failed to get locked balance from contract, using fallback subtraction' as any,
        ),
      ).to.be.true
      // Should subtract event amount from existing voting power (2000 - 1000 = 1000)
      expect(
        updateLockManagerMemberVPStub.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          lockManagerAddress: mockLogInfo.address,
          votingPower: '1000000000000000000',
          network: mockLogInfo.network,
          lastVPBlockNumber: mockLogInfo.blockNumber,
        }),
      ).to.be.true
    })

    it('should handle multiple plugins and update metrics for all', async () => {
      const mockPlugin1 = {
        address: '0xplugin1',
        daoAddress: '0xdao1',
        network: NetworksEnum.ethereumMainnet,
      }
      const mockPlugin2 = {
        address: '0xplugin2',
        daoAddress: '0xdao1', // Same DAO
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin1, mockPlugin2])
      sandbox.stub(logger, 'verbose')
      sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      sandbox.stub(ProxyMember, 'updateLockManagerMemberVP').resolves()
      const updatePluginMetricsStub = sandbox.stub(ProxyMember, 'updatePluginMetrics').resolves()
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin1.daoAddress]) // Only one unique DAO
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify updatePluginMetrics was called for both plugins
      expect(updatePluginMetricsStub.calledTwice).to.be.true
      expect(
        updatePluginMetricsStub.firstCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin1.address,
          network: mockPlugin1.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true
      expect(
        updatePluginMetricsStub.secondCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin2.address,
          network: mockPlugin2.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      // Verify message was sent only once for the unique DAO
      expect(sendMessageStub.calledOnce).to.be.true
      expect(
        sendMessageStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin1.daoAddress,
          params: { address: mockPlugin1.daoAddress, network: mockLogInfo.network },
        }),
      ).to.be.true
    })

    it('should handle errors and log them', async () => {
      const error = new Error('Database error')
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'find').rejects(error)

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error BalanceUnlocked' as any)).to.be.true
    })
  })
})
