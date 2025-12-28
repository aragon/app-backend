import { Models } from '@dbModels'
import { GovernanceVeHandler } from '@handlers/governanceVeHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { PluginSetting } from '@models/schema/setting'
import { MemberGovernanceFactory } from '@src/governance'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Handler:GovernanceVeHandler', () => {
  let sandbox: SinonSandbox
  let plugin: Plugin
  let activePluginSetting: PluginSetting | any
  let rabbitMQHelperStub: sinon.SinonStub

  // Helper to create common governance mock
  const createMockGovernance = () => {
    return {
      getOrCreate: sandbox.stub().resolves(),
      findOne: sandbox.stub().resolves({ tokenIds: [] }),
      update: sandbox.stub().resolves(),
      getOrCreatePluginMetrics: sandbox.stub().resolves(),
      updatePluginMetrics: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
    }
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    rabbitMQHelperStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    plugin = await Models.Plugin.create({
      id: 'test-plugin-1',
      address: '0x121',
      daoAddress: '0xDAO',
      tokenAddress: '0xToken',
      network: NetworksEnum.ethereumMainnet,
      interfaceType: IPluginInterfaceType.tokenVoting,
      status: IPluginStatus.installed,
      transactionHash: '0xabc1',
      blockNumber: 1,
      votingEscrow: {
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        nftLockAddress: '0xNftToken',
        exitQueueAddress: '0xExitQueue',
      },
    })

    activePluginSetting = await Models.Setting.create({
      transactionHash: '0x6796a9641df93d7902c073eaa8b45019c27e53fb3872f761a2d0a3005da4cd41',
      blockNumber: 40941779,
      blockTimestamp: 1722523956,
      network: NetworksEnum.ethereumMainnet,
      status: ISettingStatus.active,
      pluginAddress: plugin.address,
      votingEscrow: {
        minDeposit: '1000',
      },
    })
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up test data
    if (plugin) {
      // await Models.Plugin.deleteOne({ id: 'test-plugin-1' })
    }
    if (activePluginSetting) {
      await Models.Setting.deleteOne({ _id: activePluginSetting._id })
    }
  })

  describe('deposit', () => {
    it('should skip if plugin not found', async () => {
      // Don't create any plugin in database (plugin not found scenario)
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo)

      // Verify that no plugin was found
      const plugins = await Models.Plugin.find({
        'votingEscrow.escrowAddress': mockInfo.address,
        network: mockInfo.network,
      })
      expect(plugins).to.have.lengthOf(0)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for deposit event' as any)).to.be.true

      // Verify no Lock was created
      const locks = await Models.Lock.find({
        escrowAddress: mockInfo.address,
        tokenId: '123',
      })
      expect(locks).to.have.lengthOf(0)

      expect(stubCreateBaseMember.notCalled).to.be.true
      expect(stubMemberGovernanceCreate.notCalled).to.be.true
    })

    it('should handle if lock already exists', async () => {
      // The plugin is already created in beforeEach with the same escrowAddress
      // No need to create another one

      // Create existing lock in database
      await Models.Lock.create({
        id: 'existingLock',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoldtx',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 100,
        blockTimestamp: 1649999999,
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        nftAddress: '0xNftAddress',
        tokenAddress: '0xTokenAddress',
        tokenId: '123',
        amount: '5000',
        epochStartAt: 1649000000,
        totalLocked: '15000',
        exitQueueAddress: '0xExitQueueAddress',
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Create mock governance instance
      const mockGovernance = createMockGovernance()
      // Make getOrCreate return the existing lock (simulating the actual behavior)
      mockGovernance.getOrCreate.resolves({ id: 'existingLock' })
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo)

      // Verify plugin was found
      const foundPlugins = await Models.Plugin.find({
        'votingEscrow.escrowAddress': mockInfo.address,
        network: mockInfo.network,
      })
      expect(foundPlugins).to.have.lengthOf(1)

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith(mockEvent.args.depositor, mockInfo.blockNumber)).to.be.true

      // Verify governance was created and getOrCreate was called
      expect(stubMemberGovernanceCreate.calledOnce).to.be.true
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true

      // Verify updatePluginMetrics was called once (for the one plugin)
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.updatePluginMetrics.calledWith({
          memberAddress: mockEvent.args.depositor,
          pluginAddress: '0x121', // Plugin address from beforeEach
          daoAddress: '0xDAO', // DAO address from beforeEach
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 123,
        }),
      ).to.be.true

      // Verify the verbose log was called (not a warning since lock exists is handled internally)
      expect(stubLoggerVerbose.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('Deposit VeGovernance - Lock created' as any)).to.be.true

      // Verify no new Lock was created in database (still only 1)
      const locks = await Models.Lock.find({
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        tokenId: '123',
      })
      expect(locks).to.have.lengthOf(1)
      expect(locks[0].transactionHash).to.equal('0xoldtx') // Still the old one
    })

    it('should create new lock successfully (happy path)', async () => {
      // Plugin is already created in beforeEach
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Create mock governance instance
      const mockGovernance = createMockGovernance()
      // Mock successful lock creation
      const newLock = {
        id: 'newLock',
        tokenId: '456',
        memberAddress: '0xNewDepositor',
      }
      mockGovernance.getOrCreate.resolves(newLock)
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 200,
        transactionHash: '0xnewtx',
        transactionIndex: 2,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0xNewDepositor',
          tokenId: 456n,
          value: 20000n,
          startTs: 1650100000n,
          newTotalLocked: 50000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo)

      // Verify all steps were called
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0xNewDepositor', 200)).to.be.true

      expect(stubMemberGovernanceCreate.calledOnce).to.be.true
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreate.calledWith('0xNewDepositor', {
          parsedEvent: mockEvent,
          info: mockInfo,
        }),
      ).to.be.true

      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true

      expect(stubLoggerVerbose.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('Deposit VeGovernance - Lock created' as any)).to.be.true
    })

    it('should handle multiple plugins and call updatePluginMetrics for each', async () => {
      // Create additional plugins in database
      await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x222',
        daoAddress: '0xDAO2',
        tokenAddress: '0xToken2',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6', // Same escrow
          nftLockAddress: '0xNftToken2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      await Models.Plugin.create({
        id: 'test-plugin-3',
        address: '0x333',
        daoAddress: '0xDAO3',
        tokenAddress: '0xToken3',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc3',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6', // Same escrow
          nftLockAddress: '0xNftToken3',
          exitQueueAddress: '0xExitQueue3',
        },
      })

      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const mockGovernance = createMockGovernance()
      mockGovernance.getOrCreate.resolves({ id: 'newLock' })
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 300,
        transactionHash: '0xmultipletx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0xDepositor',
          tokenId: 789n,
          value: 30000n,
          startTs: 1650200000n,
          newTotalLocked: 60000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo)

      // Verify updatePluginMetrics was called 3 times (for each plugin)
      expect(mockGovernance.updatePluginMetrics.calledThrice).to.be.true

      // Verify it was called with correct params for each plugin
      expect(
        mockGovernance.updatePluginMetrics.firstCall.calledWith({
          memberAddress: '0xDepositor',
          pluginAddress: '0x121',
          daoAddress: '0xDAO',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.secondCall.calledWith({
          memberAddress: '0xDepositor',
          pluginAddress: '0x222',
          daoAddress: '0xDAO2',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.thirdCall.calledWith({
          memberAddress: '0xDepositor',
          pluginAddress: '0x333',
          daoAddress: '0xDAO3',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      // Clean up - remove the extra plugins
      // Cleanup removed - using mock database
    })

    it('should throw error when governance.getOrCreate fails', async () => {
      // Plugin is already created in beforeEach
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Create mock governance that throws error
      const mockGovernance = createMockGovernance()
      const dbError = new Error('Database connection failed')
      mockGovernance.getOrCreate.rejects(dbError)
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 400,
        transactionHash: '0xerrortx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0xErrorDepositor',
          tokenId: 999n,
          value: 40000n,
          startTs: 1650300000n,
          newTotalLocked: 70000n,
        },
      } as any

      // Handler should throw the error
      try {
        await GovernanceVeHandler.deposit(mockEvent, mockInfo)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Database connection failed')
      }

      // Verify createBaseMember was still called before the error
      expect(stubCreateBaseMember.calledOnce).to.be.true

      // Verify getOrCreate was attempted
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true

      // updatePluginMetrics should not be called since getOrCreate failed
      expect(mockGovernance.updatePluginMetrics.notCalled).to.be.true
    })

    it('should throw error if updatePluginMetrics fails', async () => {
      // Create additional plugin
      await Models.Plugin.create({
        id: 'test-plugin-error',
        address: '0x444',
        daoAddress: '0xDAO4',
        tokenAddress: '0xToken4',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc4',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken4',
          exitQueueAddress: '0xExitQueue4',
        },
      })

      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      const mockGovernance = createMockGovernance()
      mockGovernance.getOrCreate.resolves({ id: 'successLock' })
      // Make updatePluginMetrics fail on first call
      const metricsError = new Error('Metrics update failed')
      mockGovernance.updatePluginMetrics.onFirstCall().rejects(metricsError)
      mockGovernance.updatePluginMetrics.onSecondCall().resolves()

      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 500,
        transactionHash: '0xpartialerrortx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0xPartialErrorDepositor',
          tokenId: 888n,
          value: 50000n,
          startTs: 1650400000n,
          newTotalLocked: 80000n,
        },
      } as any

      // Should throw since Promise.all will fail if any promise rejects
      try {
        await GovernanceVeHandler.deposit(mockEvent, mockInfo)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Metrics update failed')
      }

      // Verify updatePluginMetrics was attempted
      expect(mockGovernance.updatePluginMetrics.called).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-error' })
    })
  })

  describe('withdraw', () => {
    it('should skip if plugin not found', async () => {
      // Don't create any plugin in database (plugin not found scenario)
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

      // Mock governance instance (won't be called since plugin not found)
      const mockGovernance = {
        update: sandbox.stub().resolves(),
      }
      const stubGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // Verify that no plugin was found
      const plugins = await Models.Plugin.find({
        'votingEscrow.escrowAddress': mockInfo.address,
        network: mockInfo.network,
      })
      expect(plugins).to.have.lengthOf(0)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for withdraw event' as any)).to.be.true

      // Verify no Lock was modified
      const locks = await Models.Lock.find({
        escrowAddress: mockInfo.address,
        tokenId: '123',
      })
      expect(locks).to.have.lengthOf(0)

      expect(stubCreateMember.notCalled).to.be.true
      expect(stubGovernanceCreate.notCalled).to.be.true
      expect(mockGovernance.update.notCalled).to.be.true
    })

    it('should log error if lock not found', async () => {
      // Plugin is already created in beforeEach with escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6'
      // Don't create any lock in database (lock not found scenario)

      const stubLogger = sandbox.stub(logger, 'error')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Create a mock governance for the plugin metrics update
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 999n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // The error "Lock not found for withdraw" is logged inside VeGovernance.lockWithdrawn
      expect(stubLogger.called).to.be.true
      const errorCalls = stubLogger.getCalls().filter(call => {
        const firstArg = call.args[0]
        return firstArg && typeof firstArg === 'string' && (firstArg as string).includes('Lock not found')
      })
      expect(errorCalls.length).to.be.greaterThan(0)

      // Verify lock was not found
      const lock = await Models.Lock.findLockMember({
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        tokenId: '999',
      })
      expect(lock).to.be.null

      // Verify createBaseMember was called (handler calls it before lockWithdrawn)
      expect(stubCreateMember.calledOnce).to.be.true

      // Verify updatePluginMetrics was called for the plugin
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
    })

    it('should skip if lockWithdraw already true', async () => {
      // Plugin is already created in beforeEach
      // Create a lock with lockWithdraw already true
      await Models.Lock.create({
        id: 'test-lock-withdraw-true',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '123',
        transactionHash: '0xoldtx',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken',
        nftAddress: '0xNftToken',
        amount: '5000',
        epochStartAt: 1650000000,
        totalLocked: '20000',
        exitQueueAddress: '0xExitQueue',
        lockWithdraw: { status: true, transactionHash: '0xwithdrawtx' },
      })

      const stubLoggerWarn = sandbox.stub(logger, 'warn')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // VeGovernance.lockWithdrawn should log a warning and return early
      expect(stubLoggerWarn.called).to.be.true
      const warnCalls = stubLoggerWarn.getCalls().filter(call => {
        const firstArg = call.args[0]
        return firstArg && typeof firstArg === 'string' && (firstArg as string).includes('Lock already withdrawn')
      })
      expect(warnCalls.length).to.be.greaterThan(0)

      // createBaseMember is called before lockWithdrawn
      expect(stubCreateMember.calledOnce).to.be.true

      // updatePluginMetrics is still called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
    })

    it('should process withdraw successfully (happy path)', async () => {
      // Plugin is already created in beforeEach
      // Create a lock first
      await Models.Lock.create({
        id: 'test-lock-withdraw-happy',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '456',
        transactionHash: '0xoriginallock',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken',
        nftAddress: '0xNftToken',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '30000',
        exitQueueAddress: '0xExitQueue',
        delegateReceiverAddress: '0xDelegate',
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 200,
        transactionHash: '0xwithdrawtx',
        transactionIndex: 2,
        logIndex: 3,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 456n,
          value: 10000n,
          ts: 1650100000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', 200)).to.be.true

      // Verify the lock was updated with withdraw information
      const updatedLock = await Models.Lock.findLockMember({
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '456',
      })
      expect(updatedLock).to.exist
      expect(updatedLock.lockWithdraw).to.exist
      expect(updatedLock.lockWithdraw.status).to.be.true
      expect(updatedLock.lockWithdraw.transactionHash).to.equal('0xwithdrawtx')
      expect(updatedLock.lockWithdraw.blockNumber).to.equal(200)
      expect(updatedLock.lockWithdraw.totalLocked).to.equal('20000')
      expect(updatedLock.lockWithdraw.amount).to.equal('10000')
      expect(updatedLock.lockWithdraw.epochEndAt).to.equal(1650100000)
      expect(updatedLock.delegateReceiverAddress).to.be.null // Should be cleared on withdraw

      // Verify updatePluginMetrics was called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.updatePluginMetrics.calledWith({
          memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          pluginAddress: '0x121',
          daoAddress: '0xDAO',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 200,
        }),
      ).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true
    })

    it('should handle multiple plugins and call updatePluginMetrics for each', async () => {
      // Create additional plugins with the same escrowAddress
      await Models.Plugin.create({
        id: 'test-plugin-withdraw-2',
        address: '0x777',
        daoAddress: '0xDAO7',
        tokenAddress: '0xToken7',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc7',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken7',
          exitQueueAddress: '0xExitQueue7',
        },
      })
      await Models.Plugin.create({
        id: 'test-plugin-withdraw-3',
        address: '0x888',
        daoAddress: '0xDAO8',
        tokenAddress: '0xToken8',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc8',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken8',
          exitQueueAddress: '0xExitQueue8',
        },
      })

      // Create a lock for withdrawal
      await Models.Lock.create({
        id: 'test-lock-withdraw-multi',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        memberAddress: '0x1234567890123456789012345678901234567890',
        tokenId: '789',
        transactionHash: '0xoriginallock2',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken',
        nftAddress: '0xNftToken',
        amount: '15000',
        epochStartAt: 1650000000,
        totalLocked: '40000',
        exitQueueAddress: '0xExitQueue',
      })

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(logger, 'verbose')

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 300,
        transactionHash: '0xmultiwithdraw',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x1234567890123456789012345678901234567890',
          tokenId: 789n,
          value: 15000n,
          ts: 1650200000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // Verify updatePluginMetrics was called 3 times (for each plugin)
      expect(mockGovernance.updatePluginMetrics.calledThrice).to.be.true

      // Verify it was called with correct params for each plugin
      expect(
        mockGovernance.updatePluginMetrics.firstCall.calledWith({
          memberAddress: '0x1234567890123456789012345678901234567890',
          pluginAddress: '0x121',
          daoAddress: '0xDAO',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.secondCall.calledWith({
          memberAddress: '0x1234567890123456789012345678901234567890',
          pluginAddress: '0x777',
          daoAddress: '0xDAO7',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.thirdCall.calledWith({
          memberAddress: '0x1234567890123456789012345678901234567890',
          pluginAddress: '0x888',
          daoAddress: '0xDAO8',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      // Clean up - remove the extra plugins
      // Cleanup removed - using mock database
    })

    it('should log error and continue when withdrawal fails', async () => {
      // Plugin is already created in beforeEach
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      // Make createBaseMember throw an error
      const createMemberError = new Error('Failed to create base member')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(createMemberError)

      // Mock governance (won't be reached due to error)
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 400,
        transactionHash: '0xerrorwithdraw',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          depositor: '0x9999999999999999999999999999999999999999',
          tokenId: 999n,
          value: 20000n,
          ts: 1650300000n,
          newTotalLocked: 10000n,
        },
      } as any

      // Handler should not throw but log the error
      await GovernanceVeHandler.withdraw(mockEvent, mockInfo)

      // Verify error was logged
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('Withdraw error' as any)).to.be.true

      // Verify verbose log was not called (since we errored early)
      expect(stubLoggerVerbose.notCalled).to.be.true

      // Verify updatePluginMetrics was not called (error occurred before)
      expect(mockGovernance.updatePluginMetrics.notCalled).to.be.true
    })
  })

  describe('exitQueued', () => {
    it('should skip if plugin not found', async () => {
      // Don't stub Models.Plugin.find - let it query the real mock database
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubLockFindLockMember = sandbox.stub(Models.Lock, 'findLockMember')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Plugin should not be found since the address doesn't match the one in beforeEach
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for exitQueued event' as any)).to.be.true
      expect(stubLockFindLockMember.notCalled).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
    })

    it('should convert bigint tokenId to string correctly', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubFindLockMember = sandbox.stub(Models.Lock, 'findLockMember').resolves({
        lockExit: { status: false },
        update: sandbox.stub().resolves(),
      } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xexitQueuedHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 9999999999999999999n, // Large bigint
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify findLockMember was called with tokenId as string
      expect(stubFindLockMember.calledOnce).to.be.true
      const findLockMemberArgs = stubFindLockMember.firstCall.args[0]
      expect(findLockMemberArgs.tokenId).to.equal('9999999999999999999')
      expect(typeof findLockMemberArgs.tokenId).to.equal('string')
    })

    it('should process exitQueued successfully (happy path)', async () => {
      // Create a plugin with exitQueueAddress
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue',
        address: '0x555',
        daoAddress: '0xDAO5',
        tokenAddress: '0xToken5',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc5',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow5',
          nftLockAddress: '0xNft5',
          exitQueueAddress: '0xExitQueueAddress',
        },
      })

      // Create a lock first
      await Models.Lock.create({
        id: 'test-lock-exitqueue-happy',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0xEscrow5',
        memberAddress: '0x1111111111111111111111111111111111111111',
        tokenId: '333',
        transactionHash: '0xoriginallock',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken5',
        nftAddress: '0xNft5',
        amount: '8000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: '0xExitQueueAddress',
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0xExitQueueAddress',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 150,
        transactionHash: '0xexittx',
        transactionIndex: 2,
        logIndex: 3,
      } as any
      const mockEvent = {
        args: {
          holder: '0x1111111111111111111111111111111111111111',
          tokenId: 333n,
          exitDate: 1650500000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x1111111111111111111111111111111111111111', 150)).to.be.true

      // Verify the lock was updated with exit information
      const updatedLock = await Models.Lock.findLockMember({
        network: NetworksEnum.ethereumMainnet,
        exitQueueAddress: '0xExitQueueAddress',
        tokenId: '333',
        memberAddress: '0x1111111111111111111111111111111111111111',
      })
      expect(updatedLock).to.exist
      expect(updatedLock.lockExit).to.exist
      expect(updatedLock.lockExit.status).to.be.true
      expect(updatedLock.lockExit.transactionHash).to.equal('0xexittx')
      expect(updatedLock.lockExit.blockNumber).to.equal(150)
      expect(updatedLock.lockExit.exitDateAt).to.equal(1650500000)

      // Verify updatePluginMetrics was called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.updatePluginMetrics.calledWith({
          memberAddress: '0x1111111111111111111111111111111111111111',
          pluginAddress: '0x555',
          daoAddress: '0xDAO5',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 150,
        }),
      ).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue' })
    })

    it('should log error if lock not found', async () => {
      // Create a plugin with exitQueueAddress
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue-notfound',
        address: '0x666',
        daoAddress: '0xDAO6',
        tokenAddress: '0xToken6',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc6',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow6',
          nftLockAddress: '0xNft6',
          exitQueueAddress: '0xExitQueue6',
        },
      })

      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0xExitQueue6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 160,
        transactionHash: '0xnotfoundtx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x2222222222222222222222222222222222222222',
          tokenId: 444n,
          exitDate: 1650600000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // The error "Lock not found for exitQueued" is logged inside VeGovernance.exitQueued
      expect(stubLoggerError.called).to.be.true
      const errorCalls = stubLoggerError.getCalls().filter(call => {
        const firstArg = call.args[0]
        return firstArg && (firstArg as any).includes && (firstArg as any).includes('Lock not found')
      })
      expect(errorCalls.length).to.be.greaterThan(0)

      // Verify createBaseMember was still called
      expect(stubCreateBaseMember.calledOnce).to.be.true

      // Verify updatePluginMetrics was still called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue-notfound' })
    })

    it('should skip if lockExit already true', async () => {
      // Create a plugin with exitQueueAddress
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue-already',
        address: '0x777',
        daoAddress: '0xDAO7',
        tokenAddress: '0xToken7',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc7',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow7',
          nftLockAddress: '0xNft7',
          exitQueueAddress: '0xExitQueue7',
        },
      })

      // Create a lock with lockExit already true
      await Models.Lock.create({
        id: 'test-lock-exitqueue-already',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0xEscrow7',
        memberAddress: '0x3333333333333333333333333333333333333333',
        tokenId: '555',
        transactionHash: '0xoriginallock',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken7',
        nftAddress: '0xNft7',
        amount: '9000',
        epochStartAt: 1650000000,
        totalLocked: '30000',
        exitQueueAddress: '0xExitQueue7',
        lockExit: { status: true, transactionHash: '0xoldexittx', blockNumber: 90, exitDateAt: 1650400000 },
      })

      const stubLoggerWarn = sandbox.stub(logger, 'warn')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0xExitQueue7',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 170,
        transactionHash: '0xduplicateexittx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x3333333333333333333333333333333333333333',
          tokenId: 555n,
          exitDate: 1650700000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // VeGovernance.exitQueued should log a warning and return early
      expect(stubLoggerWarn.called).to.be.true
      const warnCalls = stubLoggerWarn.getCalls().filter(call => {
        const firstArg = call.args[0]
        return firstArg && (firstArg as any).includes && (firstArg as any).includes('Lock already exit queued')
      })
      expect(warnCalls.length).to.be.greaterThan(0)

      // createBaseMember is called before exitQueued
      expect(stubCreateBaseMember.calledOnce).to.be.true

      // updatePluginMetrics is still called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue-already' })
    })

    it('should handle multiple plugins and call updatePluginMetrics for each', async () => {
      // Create multiple plugins with the same exitQueueAddress
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue-multi-1',
        address: '0x888',
        daoAddress: '0xDAO8',
        tokenAddress: '0xToken8',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc8',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow8',
          nftLockAddress: '0xNft8',
          exitQueueAddress: '0xExitQueueMulti',
        },
      })
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue-multi-2',
        address: '0x999',
        daoAddress: '0xDAO9',
        tokenAddress: '0xToken8', // Same token as first plugin
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc9',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow8',
          nftLockAddress: '0xNft8',
          exitQueueAddress: '0xExitQueueMulti',
        },
      })

      // Create a lock for exit queue
      await Models.Lock.create({
        id: 'test-lock-exitqueue-multi',
        network: NetworksEnum.ethereumMainnet,
        escrowAddress: '0xEscrow8',
        memberAddress: '0x4444444444444444444444444444444444444444',
        tokenId: '666',
        transactionHash: '0xoriginallock',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        tokenAddress: '0xToken8',
        nftAddress: '0xNft8',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '35000',
        exitQueueAddress: '0xExitQueueMulti',
      })

      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(logger, 'verbose')

      // Mock governance for plugin metrics
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0xExitQueueMulti',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 180,
        transactionHash: '0xmultiexittx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x4444444444444444444444444444444444444444',
          tokenId: 666n,
          exitDate: 1650800000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify updatePluginMetrics was called 2 times (for each plugin)
      expect(mockGovernance.updatePluginMetrics.calledTwice).to.be.true

      // Verify it was called with correct params for each plugin
      expect(
        mockGovernance.updatePluginMetrics.firstCall.calledWith({
          memberAddress: '0x4444444444444444444444444444444444444444',
          pluginAddress: '0x888',
          daoAddress: '0xDAO8',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 180,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.secondCall.calledWith({
          memberAddress: '0x4444444444444444444444444444444444444444',
          pluginAddress: '0x999',
          daoAddress: '0xDAO9',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 180,
        }),
      ).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue-multi-1' })
      // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue-multi-2' })
    })

    it('should log error and continue when exitQueued fails', async () => {
      // Create a plugin with exitQueueAddress
      await Models.Plugin.create({
        id: 'test-plugin-exitqueue-error',
        address: '0xAAA',
        daoAddress: '0xDAOA',
        tokenAddress: '0xTokenA',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcA',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrowA',
          nftLockAddress: '0xNftA',
          exitQueueAddress: '0xExitQueueError',
        },
      })

      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      // Make createBaseMember throw an error
      const createMemberError = new Error('Failed to create base member')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(createMemberError)

      // Mock governance (won't be reached due to error)
      const mockGovernance = {
        updatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0xExitQueueError',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 190,
        transactionHash: '0xerrorexittx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          holder: '0x5555555555555555555555555555555555555555',
          tokenId: 777n,
          exitDate: 1650900000n,
        },
      } as any

      // Handler should not throw but log the error
      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify error was logged
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('ExitQueued error' as any)).to.be.true

      // Verify verbose log was not called (since we errored early)
      expect(stubLoggerVerbose.notCalled).to.be.true

      // Verify updatePluginMetrics was not called (error occurred before)
      expect(mockGovernance.updatePluginMetrics.notCalled).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-exitqueue-error' })
    })
  })

  describe('minDepositSet', () => {
    it('should skip if plugin not found', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubSettingFindActive = sandbox.stub(Models.Setting, 'findActive')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      // Plugin should not be found since the address doesn't match the one in beforeEach
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for minDepositSet event' as any)).to.be.true
      expect(stubSettingFindActive.notCalled).to.be.true
    })

    it('should log error if active plugin setting not found', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Active plugin setting not found for minDepositSet event' as any)).to.be.true
    })

    it('should skip if minDeposit already set to same value', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: {
          minDeposit: '5000', // Already set to same value
        },
        save: stubSave,
      }
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(stubSave.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should update setting and save when minDeposit is different', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: {
          minDeposit: '2000', // Different value
        },
        save: stubSave,
      }
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminDepositHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(mockSetting.votingEscrow.minDeposit).to.equal('5000')
      expect(stubSave.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('minDepositSet VeGovernance' as any)).to.be.true
    })

    it('should create votingEscrow object if it does not exist', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueueAddress',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        // No votingEscrow property
        save: stubSave,
      } as any
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminDepositHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(mockSetting.votingEscrow).to.exist
      expect(mockSetting.votingEscrow.minDeposit).to.equal('5000')
      expect(stubSave.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle multiple plugins and update all settings', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress1',
            exitQueueAddress: '0xExitQueueAddress1',
          },
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress2',
            exitQueueAddress: '0xExitQueueAddress2',
          },
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      const stubSave1 = sandbox.stub().resolves()
      const stubSave2 = sandbox.stub().resolves()
      const mockSetting1 = {
        votingEscrow: { minDeposit: '1000' },
        save: stubSave1,
      }
      const mockSetting2 = {
        votingEscrow: { minDeposit: '2000' },
        save: stubSave2,
      }

      const stubFindActive = sandbox.stub(Models.Setting, 'findActive')
      stubFindActive.onFirstCall().resolves(mockSetting1 as any)
      stubFindActive.onSecondCall().resolves(mockSetting2 as any)

      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmultiSettingHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 3000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(mockSetting1.votingEscrow.minDeposit).to.equal('3000')
      expect(mockSetting2.votingEscrow.minDeposit).to.equal('3000')
      expect(stubSave1.calledOnce).to.be.true
      expect(stubSave2.calledOnce).to.be.true
      expect(stubLogger.calledTwice).to.be.true
    })

    it('should handle mixed plugin settings (some found, some not)', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress1',
            exitQueueAddress: '0xExitQueueAddress1',
          },
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress2',
            exitQueueAddress: '0xExitQueueAddress2',
          },
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: { minDeposit: '1000' },
        save: stubSave,
      }

      const stubFindActive = sandbox.stub(Models.Setting, 'findActive')
      stubFindActive.onFirstCall().resolves(null) // First plugin setting not found
      stubFindActive.onSecondCall().resolves(mockSetting as any) // Second plugin setting found

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmixedSettingHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 3000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('Active plugin setting not found for minDepositSet event' as any)).to.be.true
      expect(mockSetting.votingEscrow.minDeposit).to.equal('3000')
      expect(stubSave.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle bigint minDeposit conversion and use real database operations', async () => {
      // Create a real plugin and setting in the database
      await Models.Plugin.create({
        id: 'test-plugin-mindeposit-real',
        address: '0xBBB',
        daoAddress: '0xDAOB',
        tokenAddress: '0xTokenB',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcB',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xRealEscrowAddressForMinDepositTest123456',
          nftLockAddress: '0xNftB',
          exitQueueAddress: '0xExitQueueB',
        },
      })

      // Create a real setting in the database
      const setting = await Models.Setting.create({
        id: 'test-setting-mindeposit-real',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xBBB',
        tokenAddress: '0xTokenB',
        daoAddress: '0xDAOB',
        isActive: true,
        blockNumber: 1,
        transactionHash: '0xsettingtx',
        status: ISettingStatus.active,
        votingEscrow: {
          minDeposit: '1000000000000000000', // 1 ETH in wei
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xRealEscrowAddressForMinDepositTest123456',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 200,
        transactionHash: '0xbigintmindeposittx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minDeposit: 5000000000000000000n, // 5 ETH in wei as bigint
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      // Verify the setting was updated in the database
      const updatedSetting = await Models.Setting.findActive({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xBBB',
      })
      expect(updatedSetting).to.exist
      expect(updatedSetting.votingEscrow).to.exist
      expect(updatedSetting.votingEscrow.minDeposit).to.equal('5000000000000000000') // Should be converted to string

      // Verify verbose logging
      expect(stubLoggerVerbose.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('minDepositSet VeGovernance' as any)).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-mindeposit-real' })
      await Models.Setting.deleteOne({ id: 'test-setting-mindeposit-real' })
    })
  })

  describe('minLockSet', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubSettingFindActive = sandbox.stub(Models.Setting, 'findActive')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 86400n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(stubPluginFind.calledOnce).to.be.true
      expect(
        stubPluginFind.calledWith({
          'votingEscrow.exitQueueAddress': mockInfo.address,
          network: mockInfo.network,
        }),
      ).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for minLockSet event' as any)).to.be.true
      expect(stubSettingFindActive.notCalled).to.be.true
    })

    it('should log error if active plugin setting not found', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])
      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 86400n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Active plugin setting not found for minLockSet event' as any)).to.be.true
    })

    it('should skip if minLockTime already set to same value', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: {
          minLockTime: 86400, // Already set to same value
        },
        save: stubSave,
      }
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 86400n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(stubSave.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should update setting and save when minLockTime is different', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: {
          minLockTime: 43200, // Different value
        },
        save: stubSave,
      }
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminLockHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 604800n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(mockSetting.votingEscrow.minLockTime).to.equal(604800)
      expect(stubSave.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('minLockSet VeGovernance' as any)).to.be.true
    })

    it('should create votingEscrow object if it does not exist', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        // No votingEscrow property
        save: stubSave,
      } as any
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminLockHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 604800n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(mockSetting.votingEscrow).to.exist
      expect(mockSetting.votingEscrow.minLockTime).to.equal(604800)
      expect(stubSave.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle multiple plugins and update all settings', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0xEscrowAddress1',
            nftLockAddress: '0xNftAddress1',
            exitQueueAddress: '0xExitQueue',
          },
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0xEscrowAddress2',
            nftLockAddress: '0xNftAddress2',
            exitQueueAddress: '0xExitQueue',
          },
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)

      const stubSave1 = sandbox.stub().resolves()
      const stubSave2 = sandbox.stub().resolves()
      const mockSetting1 = {
        votingEscrow: { minLockTime: 86400 },
        save: stubSave1,
      }
      const mockSetting2 = {
        votingEscrow: { minLockTime: 172800 },
        save: stubSave2,
      }

      const stubFindActive = sandbox.stub(Models.Setting, 'findActive')
      stubFindActive.onFirstCall().resolves(mockSetting1 as any)
      stubFindActive.onSecondCall().resolves(mockSetting2 as any)

      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmultiSettingHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 604800n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(mockSetting1.votingEscrow.minLockTime).to.equal(604800)
      expect(mockSetting2.votingEscrow.minLockTime).to.equal(604800)
      expect(stubSave1.calledOnce).to.be.true
      expect(stubSave2.calledOnce).to.be.true
      expect(stubLogger.calledTwice).to.be.true
    })

    it('should convert bigint to number correctly', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xTokenAddress',
        votingEscrow: {
          escrowAddress: '0xEscrowAddress',
          nftLockAddress: '0xNftAddress',
          exitQueueAddress: '0xExitQueue',
        },
      }
      sandbox.stub(Models.Plugin, 'find').resolves([mockPlugin])

      const stubSave = sandbox.stub().resolves()
      const mockSetting = {
        votingEscrow: { minLockTime: 0 },
        save: stubSave,
      }
      sandbox.stub(Models.Setting, 'findActive').resolves(mockSetting as any)
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminLockHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 9999999999n, // Large bigint
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(mockSetting.votingEscrow.minLockTime).to.equal(9999999999)
      expect(typeof mockSetting.votingEscrow.minLockTime).to.equal('number')
      expect(stubSave.calledOnce).to.be.true
    })

    it('should handle real database operations and mixed plugin settings', async () => {
      // Create real plugins and settings in the database
      await Models.Plugin.create({
        id: 'test-plugin-minlock-real-1',
        address: '0xCCC',
        daoAddress: '0xDAOC',
        tokenAddress: '0xTokenC',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcC',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrowC',
          nftLockAddress: '0xNftC',
          exitQueueAddress: '0xRealExitQueueAddressForMinLockTest123456',
        },
      })

      await Models.Plugin.create({
        id: 'test-plugin-minlock-real-2',
        address: '0xDDD',
        daoAddress: '0xDAOD',
        tokenAddress: '0xTokenD',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcD',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrowD',
          nftLockAddress: '0xNftD',
          exitQueueAddress: '0xRealExitQueueAddressForMinLockTest123456',
        },
      })

      // Create a real setting for first plugin only (second plugin setting not found scenario)
      await Models.Setting.create({
        id: 'test-setting-minlock-real',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xCCC',
        tokenAddress: '0xTokenC',
        daoAddress: '0xDAOC',
        isActive: true,
        blockNumber: 1,
        transactionHash: '0xsettingtx',
        status: ISettingStatus.active,
        votingEscrow: {
          minLockTime: 7200, // 2 hours
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xRealExitQueueAddressForMinLockTest123456',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 300,
        transactionHash: '0xrealminlocktx',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          minLock: 1209600n, // 14 days in seconds as bigint
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      // Verify the first setting was updated in the database
      const updatedSetting = await Models.Setting.findActive({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xCCC',
      })
      expect(updatedSetting).to.exist
      expect(updatedSetting.votingEscrow).to.exist
      expect(updatedSetting.votingEscrow.minLockTime).to.equal(1209600) // Should be converted to number

      // Verify error was logged for second plugin (setting not found)
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('Active plugin setting not found for minLockSet event' as any)).to.be.true

      // Verify verbose logging for successful update
      expect(stubLoggerVerbose.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('minLockSet VeGovernance' as any)).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-minlock-real-1' })
      // await Models.Plugin.deleteOne({ id: 'test-plugin-minlock-real-2' })
      await Models.Setting.deleteOne({ id: 'test-setting-minlock-real' })
    })
  })

  describe('delegateTokens', () => {
    it('should skip if no plugins found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      const mockInfo = {
        address: '0xNonExistentToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Should return early without doing anything
      const plugins = await Models.Plugin.find({
        tokenAddress: mockInfo.address,
        network: mockInfo.network,
      })
      expect(plugins).to.have.lengthOf(0)

      // No error should be logged since this is expected behavior
      expect(stubLogger.notCalled).to.be.true
    })

    it('should handle self-delegation scenario', async () => {
      // Create a plugin for delegation
      await Models.Plugin.create({
        id: 'test-plugin-delegate-self',
        address: '0xEEE',
        daoAddress: '0xDAOE',
        tokenAddress: '0xTokenDelegate',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabcE',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrowE',
          nftLockAddress: '0xNftE',
          exitQueueAddress: '0xExitQueueE',
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for delegation
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Self-delegation
          tokenIds: [456n, 789n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenDelegate',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 150,
        transactionHash: '0xselfdelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Verify createBaseMember was called only once (self-delegation)
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', 150)).to.be.true

      // Verify delegation update was called
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', {
          tokenIds: ['456', '789'],
          delegateReceiverAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        }),
      ).to.be.true

      // Verify plugin metrics update was called only once (self-delegation)
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.updatePluginMetrics.calledWith({
          memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          pluginAddress: '0xEEE',
          daoAddress: '0xDAOE',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 150,
        }),
      ).to.be.true

      // Verify DAO metrics update was called
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true
    })

    it('should handle delegation between different addresses with multiple plugins', async () => {
      // Create multiple plugins with same tokenAddress
      await Models.Plugin.create({
        id: 'test-plugin-delegate-multi-1',
        address: '0xFFF',
        daoAddress: '0xDAOF',
        tokenAddress: '0xTokenDelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        transactionHash: '0xabcF',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrowF',
          nftLockAddress: '0xNftF',
          exitQueueAddress: '0xExitQueueF',
        },
      })

      await Models.Plugin.create({
        id: 'test-plugin-delegate-multi-2',
        address: '0x111',
        daoAddress: '0xDAO1',
        tokenAddress: '0xTokenDelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        transactionHash: '0xabc1',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow1',
          nftLockAddress: '0xNft1',
          exitQueueAddress: '0xExitQueue1',
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for delegation - create separate instances for each call
      const mockGovernanceForDelegation = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }

      const mockGovernanceForMetrics = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      } as any

      const createStub = sandbox.stub(MemberGovernanceFactory, 'create')
      // First call for delegation update
      createStub.onFirstCall().returns(mockGovernanceForDelegation as any)
      // Subsequent calls for metrics updates
      createStub.returns(mockGovernanceForMetrics)

      const mockParsedEvent = {
        args: {
          sender: '0x1111111111111111111111111111111111111111',
          delegatee: '0x2222222222222222222222222222222222222222',
          tokenIds: [100n, 200n, 300n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenDelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 200,
        transactionHash: '0xmultidelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Verify createBaseMember was called twice (sender and receiver)
      expect(stubCreateBaseMember.calledTwice).to.be.true
      expect(stubCreateBaseMember.firstCall.calledWith('0x1111111111111111111111111111111111111111', 200)).to.be.true
      expect(stubCreateBaseMember.secondCall.calledWith('0x2222222222222222222222222222222222222222', 200)).to.be.true

      // Verify delegation update was called
      expect(mockGovernanceForDelegation.update.calledOnce).to.be.true
      expect(
        mockGovernanceForDelegation.update.calledWith('0x2222222222222222222222222222222222222222', {
          tokenIds: ['100', '200', '300'],
          delegateReceiverAddress: '0x2222222222222222222222222222222222222222',
        }),
      ).to.be.true

      // Verify plugin metrics update was called 4 times (2 plugins * 2 addresses)
      expect(mockGovernanceForMetrics.updatePluginMetrics.callCount).to.equal(4)

      // Collect all calls
      const allCalls: any = []
      for (let i = 0; i < 4; i++) {
        allCalls.push(mockGovernanceForMetrics.updatePluginMetrics.getCall(i).args[0])
      }

      // Define expected calls (order doesn't matter)
      const expectedCalls = [
        {
          memberAddress: '0x1111111111111111111111111111111111111111',
          pluginAddress: '0xFFF',
          daoAddress: '0xDAOF',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 200,
        },
        {
          memberAddress: '0x1111111111111111111111111111111111111111',
          pluginAddress: '0x111',
          daoAddress: '0xDAO1',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 200,
        },
        {
          memberAddress: '0x2222222222222222222222222222222222222222',
          pluginAddress: '0xFFF',
          daoAddress: '0xDAOF',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 200,
        },
        {
          memberAddress: '0x2222222222222222222222222222222222222222',
          pluginAddress: '0x111',
          daoAddress: '0xDAO1',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 200,
        },
      ]

      // Check that all expected calls were made (order doesn't matter)
      expectedCalls.forEach(expectedCall => {
        const found = allCalls.some(actualCall => {
          try {
            expect(actualCall).to.deep.equal(expectedCall)
            return true
          } catch {
            return false
          }
        })
        expect(found, `Expected call not found: ${JSON.stringify(expectedCall)}`).to.be.true
      })

      // Verify DAO metrics update was called
      expect(mockGovernanceForDelegation.updateDaoMetrics.calledOnce).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true
    })

    it('should log error and continue when delegation fails', async () => {
      // Create a plugin for delegation
      await Models.Plugin.create({
        id: 'test-plugin-delegate-error',
        address: '0x222',
        daoAddress: '0xDAO2',
        tokenAddress: '0xTokenDelegateError',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow2',
          nftLockAddress: '0xNft2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      // Make createBaseMember throw an error
      const createMemberError = new Error('Failed to create base member')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(createMemberError)

      // Mock governance (won't be reached due to error)
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x3333333333333333333333333333333333333333',
          delegatee: '0x4444444444444444444444444444444444444444',
          tokenIds: [999n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenDelegateError',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 250,
        transactionHash: '0xerrordelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      // Handler should not throw but log the error
      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Verify error was logged
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('DelegateTokens error' as any)).to.be.true

      // Verify verbose log was not called (since we errored early)
      expect(stubLoggerVerbose.notCalled).to.be.true

      // Verify delegation methods were not called (error occurred before)
      expect(mockGovernance.update.notCalled).to.be.true
      expect(mockGovernance.updatePluginMetrics.notCalled).to.be.true
      expect(mockGovernance.updateDaoMetrics.notCalled).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-delegate-error' })
    })
  })

  describe('unDelegateTokens', () => {
    it('should skip if no plugins found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenIds: [123n],
        },
      } as any

      const mockInfo = {
        address: '0xNonExistentTokenUndelegate',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockParsedEvent, mockInfo)

      // Should return early without doing anything
      const plugins = await Models.Plugin.find({
        tokenAddress: mockInfo.address,
        network: mockInfo.network,
      })
      expect(plugins).to.have.lengthOf(0)

      // No error should be logged since this is expected behavior
      expect(stubLogger.notCalled).to.be.true
    })

    it('should handle undelegation with single plugin', async () => {
      // Create a plugin for undelegation
      await Models.Plugin.create({
        id: 'test-plugin-undelegate-single',
        address: '0x333',
        daoAddress: '0xDAO3',
        tokenAddress: '0xTokenUndelegate',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc3',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow3',
          nftLockAddress: '0xNft3',
          exitQueueAddress: '0xExitQueue3',
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for undelegation
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x5555555555555555555555555555555555555555',
          tokenIds: [456n, 789n, 101112n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenUndelegate',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 300,
        transactionHash: '0xundelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockParsedEvent, mockInfo)

      // Verify createBaseMember was called only for sender
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x5555555555555555555555555555555555555555', 300)).to.be.true

      // Verify undelegation update was called with null delegateReceiverAddress
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x5555555555555555555555555555555555555555', {
          tokenIds: ['456', '789', '101112'],
          delegateReceiverAddress: null,
        }),
      ).to.be.true

      // Verify plugin metrics update was called only for sender
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.updatePluginMetrics.calledWith({
          memberAddress: '0x5555555555555555555555555555555555555555',
          pluginAddress: '0x333',
          daoAddress: '0xDAO3',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 300,
        }),
      ).to.be.true

      // Verify DAO metrics update was called
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-single' })
    })

    it('should handle undelegation with multiple plugins', async () => {
      // Create multiple plugins with same tokenAddress
      await Models.Plugin.create({
        id: 'test-plugin-undelegate-multi-1',
        address: '0x444',
        daoAddress: '0xDAO4',
        tokenAddress: '0xTokenUndelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc4',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow4',
          nftLockAddress: '0xNft4',
          exitQueueAddress: '0xExitQueue4',
        },
      })

      await Models.Plugin.create({
        id: 'test-plugin-undelegate-multi-2',
        address: '0x555',
        daoAddress: '0xDAO5',
        tokenAddress: '0xTokenUndelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc5',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow5',
          nftLockAddress: '0xNft5',
          exitQueueAddress: '0xExitQueue5',
        },
      })

      await Models.Plugin.create({
        id: 'test-plugin-undelegate-multi-3',
        address: '0x666',
        daoAddress: '0xDAO6',
        tokenAddress: '0xTokenUndelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc6',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow6',
          nftLockAddress: '0xNft6',
          exitQueueAddress: '0xExitQueue6',
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for undelegation
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x6666666666666666666666666666666666666666',
          tokenIds: [777n, 888n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenUndelegateMulti',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 400,
        transactionHash: '0xmultiundelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockParsedEvent, mockInfo)

      // Verify createBaseMember was called only once for sender
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x6666666666666666666666666666666666666666', 400)).to.be.true

      // Verify undelegation update was called
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x6666666666666666666666666666666666666666', {
          tokenIds: ['777', '888'],
          delegateReceiverAddress: null,
        }),
      ).to.be.true

      // Verify plugin metrics update was called 3 times (for each plugin)
      expect(mockGovernance.updatePluginMetrics.callCount).to.equal(3)

      // Check calls for sender on all plugins
      expect(
        mockGovernance.updatePluginMetrics.getCall(0).calledWith({
          memberAddress: '0x6666666666666666666666666666666666666666',
          pluginAddress: '0x444',
          daoAddress: '0xDAO4',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 400,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.getCall(1).calledWith({
          memberAddress: '0x6666666666666666666666666666666666666666',
          pluginAddress: '0x555',
          daoAddress: '0xDAO5',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 400,
        }),
      ).to.be.true

      expect(
        mockGovernance.updatePluginMetrics.getCall(2).calledWith({
          memberAddress: '0x6666666666666666666666666666666666666666',
          pluginAddress: '0x666',
          daoAddress: '0xDAO6',
          network: NetworksEnum.ethereumMainnet,
          lastActivity: 400,
        }),
      ).to.be.true

      // Verify DAO metrics update was called
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true

      // Verify verbose logging
      expect(stubLoggerVerbose.called).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-multi-1' })
      // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-multi-2' })
      // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-multi-3' })
    })

    it('should handle empty tokenIds array', async () => {
      // Create a plugin for undelegation
      await Models.Plugin.create({
        id: 'test-plugin-undelegate-empty',
        address: '0x777',
        daoAddress: '0xDAO7',
        tokenAddress: '0xTokenUndelegateEmpty',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc7',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow7',
          nftLockAddress: '0xNft7',
          exitQueueAddress: '0xExitQueue7',
        },
      })

      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance for undelegation
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x7777777777777777777777777777777777777777',
          tokenIds: [], // Empty array
        },
      } as any

      const mockInfo = {
        address: '0xTokenUndelegateEmpty',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 500,
        transactionHash: '0xemptyundelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockParsedEvent, mockInfo)

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true

      // Verify undelegation update was called with empty tokenIds array
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x7777777777777777777777777777777777777777', {
          tokenIds: [],
          delegateReceiverAddress: null,
        }),
      ).to.be.true

      // Verify plugin metrics update was called
      expect(mockGovernance.updatePluginMetrics.calledOnce).to.be.true

      // Verify DAO metrics update was called
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-empty' })
    })

    it('should log error and continue when undelegation fails', async () => {
      // Create a plugin for undelegation
      await Models.Plugin.create({
        id: 'test-plugin-undelegate-error',
        address: '0x888',
        daoAddress: '0xDAO8',
        tokenAddress: '0xTokenUndelegateError',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc8',
        blockNumber: 1,
        votingEscrow: {
          escrowAddress: '0xEscrow8',
          nftLockAddress: '0xNft8',
          exitQueueAddress: '0xExitQueue8',
        },
      })

      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      // Make createBaseMember throw an error
      const createMemberError = new Error('Failed to create base member')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(createMemberError)

      // Mock governance (won't be reached due to error)
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x8888888888888888888888888888888888888888',
          tokenIds: [999n],
        },
      } as any

      const mockInfo = {
        address: '0xTokenUndelegateError',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 600,
        transactionHash: '0xerrorundelegatetx',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      // Handler should not throw but log the error
      await GovernanceVeHandler.unDelegateTokens(mockParsedEvent, mockInfo)

      // Verify error was logged
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('UnDelegateTokens error' as any)).to.be.true

      // Verify verbose log was not called (since we errored early)
      expect(stubLoggerVerbose.notCalled).to.be.true

      // Verify undelegation methods were not called (error occurred before)
      expect(mockGovernance.update.notCalled).to.be.true
      expect(mockGovernance.updatePluginMetrics.notCalled).to.be.true
      expect(mockGovernance.updateDaoMetrics.notCalled).to.be.true

      // Cleanup removed - using mock database
      // // await Models.Plugin.deleteOne({ id: 'test-plugin-undelegate-error' })
    })
  })

  describe('delegateTokens (legacy tests)', () => {
    it('should handle empty tokenIds arrays (legacy test with stubs)', async () => {
      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance with complete interface
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [],
        },
      } as any

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Verify delegation update was called with empty tokenIds array
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(mockGovernance.update.firstCall.args[1].tokenIds).to.deep.equal([])
      expect(mockGovernance.update.firstCall.args[1].delegateReceiverAddress).to.equal(
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
      )
    })

    it('should handle token with clockMode as BlockNumber (legacy test with stubs)', async () => {
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance with complete interface
      const mockGovernance = {
        update: sandbox.stub().resolves(),
        updatePluginMetrics: sandbox.stub().resolves(),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      await GovernanceVeHandler.delegateTokens(mockParsedEvent, mockInfo)

      // Verify governance update was called with tokenIds and delegateReceiverAddress
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x75D9d3887aa9a9ee78901E96819B574160E4EAC6', {
          tokenIds: ['123'],
          delegateReceiverAddress: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        }),
      ).to.be.true
    })
  })
})
