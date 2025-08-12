import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import LockManagerHandler from '@handlers/lockManagerHandler'
import { Models } from '@dbModels'
import logger from '@logger'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NetworksEnum, EnumQueueName, IPluginInterfaceType } from '@types'
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

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves(null), // New member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const createGovernanceStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const getUniqueValuesByKeyStub = sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify createBaseMember was called
      expect(createBaseMemberStub.calledOnce).to.be.true
      expect(createBaseMemberStub.calledWith(mockParsedEvent.args.voter, mockLogInfo.blockNumber)).to.be.true

      // Verify MemberGovernanceFactory.create was called
      expect(createGovernanceStub.calledOnce).to.be.true
      expect(
        createGovernanceStub.calledWith({
          address: mockLogInfo.address,
          network: mockLogInfo.network,
          interfaceType: IPluginInterfaceType.lockToVote,
        }),
      ).to.be.true

      // Verify governance.update was called
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1000000000000000000',
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      // Verify getUserLockedBalance was called
      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(getUserLockedBalanceStub.calledWith(mockLogInfo.network, mockLogInfo.address, mockParsedEvent.args.voter))
        .to.be.true

      // Verify getOrCreatePluginMetrics was called
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin.address,
          daoAddress: mockPlugin.daoAddress,
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

      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance with existing member
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '500000000000000000' }), // Existing member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const createGovernanceStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1500000000000000000',
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance locked successfully' as any)).to.be.true
    })

    it('should handle case when plugins are not found', async () => {
      const findPluginStub = sandbox.stub(Models.Plugin, 'find').resolves([])
      const createBaseMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const createGovernanceStub = sandbox.stub(MemberGovernanceFactory, 'create')

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(createBaseMemberStub.notCalled).to.be.true
      expect(createGovernanceStub.notCalled).to.be.true
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

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance - new member has no voting power yet
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves(null), // New member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should use event amount as initial voting power
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1000000000000000000',
          lastActivity: mockLogInfo.blockNumber,
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

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance - existing member with 500 voting power
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '500000000000000000' }), // Existing member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(
        warnStub.calledWith('BalanceLocked - Failed to get locked balance from contract, using fallback sum' as any),
      ).to.be.true
      // Should add event amount to existing voting power (500 + 1000 = 1500)
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1500000000000000000',
          lastActivity: mockLogInfo.blockNumber,
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

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves(null), // New member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin1.daoAddress, mockPlugin2.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceLocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify getOrCreatePluginMetrics was called for both plugins
      expect(mockGovernance.getOrCreatePluginMetrics.calledTwice).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.firstCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin1.address,
          daoAddress: mockPlugin1.daoAddress,
          network: mockPlugin1.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.secondCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin2.address,
          daoAddress: mockPlugin2.daoAddress,
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

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '1000000000000000000' }), // Had balance before
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '0',
          lastActivity: mockLogInfo.blockNumber,
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

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '2000000000000000000' }), // Had 2000 before
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1000000000000000000',
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true

      expect(getUserLockedBalanceStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Balance unlocked successfully' as any)).to.be.true
    })

    it('should handle case when plugins are not found', async () => {
      const findPluginStub = sandbox.stub(Models.Plugin, 'find').resolves([])
      const createGovernanceStub = sandbox.stub(MemberGovernanceFactory, 'create')

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(findPluginStub.calledOnce).to.be.true
      expect(createGovernanceStub.notCalled).to.be.true
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

      // Mock governance instance - member has no voting power
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves(null), // No existing member
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const createGovernanceStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      expect(mockGovernance.update.notCalled).to.be.true
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

      // Mock governance instance - had 2000 tokens locked
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '2000000000000000000' }), // Had 2000 tokens locked
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

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
        mockGovernance.update.calledWith(mockParsedEvent.args.voter, {
          votingPower: '1000000000000000000',
          lastActivity: mockLogInfo.blockNumber,
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

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ votingPower: '1000000000000000000' }), // Had balance
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin1.daoAddress]) // Only one unique DAO
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await LockManagerHandler.balanceUnlocked(mockParsedEvent as any, mockLogInfo as any)

      // Verify getOrCreatePluginMetrics was called for both plugins
      expect(mockGovernance.getOrCreatePluginMetrics.calledTwice).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.firstCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin1.address,
          daoAddress: mockPlugin1.daoAddress,
          network: mockPlugin1.network,
          lastActivity: mockLogInfo.blockNumber,
        }),
      ).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.secondCall.calledWith({
          memberAddress: mockParsedEvent.args.voter,
          pluginAddress: mockPlugin2.address,
          daoAddress: mockPlugin2.daoAddress,
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
