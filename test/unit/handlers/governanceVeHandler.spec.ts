import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import {
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  ITokenType,
  NetworksEnum,
  ITransferSide,
  EnumQueueName,
  IClockMode,
} from '@types'
import type Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import logger from '@logger'
import { GovernanceVeHandler } from '@handlers/governanceVeHandler'
import { expect } from 'chai'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import Web3Helper from '@helpers/web3'
import { PluginSetting } from '@models/schema/setting'
import { ProxyToken } from '@modules/proxyToken'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'

describe('Handler:GovernanceVeHandler', () => {
  let sandbox: SinonSandbox
  let plugin: Plugin
  let activePluginSetting: PluginSetting | any
  let rabbitMQHelperStub: sinon.SinonStub

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
  })

  describe('deposit', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'error')
      const stubLockCreate = sandbox.stub(Models.Lock, 'create')
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

      expect(stubPluginFind.calledOnce).to.be.true
      expect(
        stubPluginFind.calledWith({
          'votingEscrow.escrowAddress': mockInfo.address,
          network: mockInfo.network,
        }),
      ).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for deposit event' as any)).to.be.true
      expect(stubLockCreate.notCalled).to.be.true
      expect(stubCreateBaseMember.notCalled).to.be.true
      expect(stubMemberGovernanceCreate.notCalled).to.be.true
    })

    it('should log warning if lock already exists', async () => {
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
      sandbox.stub(Models.Lock, 'findExistingLog').resolves({ id: 'existingLock' } as any)
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubLockCreate = sandbox.stub(Models.Lock, 'create')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create')

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

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Deposit VeGovernance - Lock already exists' as any)).to.be.true
      expect(stubLockCreate.notCalled).to.be.true
      expect(stubCreateBaseMember.notCalled).to.be.true
      expect(stubMemberGovernanceCreate.notCalled).to.be.true
    })

    it('should create Lock and update TokenMember with new tokenId', async () => {
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
      sandbox.stub(Models.Lock, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const stubLockCreate = sandbox.stub(Models.Lock, 'create').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ tokenIds: [] }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])

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

      // Verify Lock.create was called with correct params
      expect(stubLockCreate.calledOnce).to.be.true
      const lockCreateArgs = stubLockCreate.firstCall.args[0]
      expect(lockCreateArgs).to.deep.include({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
        blockNumber: mockInfo.blockNumber,
        blockTimestamp: 1650009999,
        escrowAddress: mockPlugin.votingEscrow.escrowAddress,
        memberAddress: mockEvent.args.depositor,
        nftAddress: mockPlugin.votingEscrow.nftLockAddress,
        tokenAddress: mockPlugin.tokenAddress,
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: mockPlugin.votingEscrow.exitQueueAddress,
      })

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith(mockEvent.args.depositor, mockInfo.blockNumber)).to.be.true

      // Verify MemberGovernanceFactory.create was called
      expect(stubMemberGovernanceCreate.calledOnce).to.be.true
      expect(
        stubMemberGovernanceCreate.calledWith({
          address: mockPlugin.tokenAddress,
          network: mockInfo.network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
        }),
      ).to.be.true

      // Verify governance methods were called
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true
      expect(mockGovernance.getOrCreate.calledWith(mockEvent.args.depositor)).to.be.true

      expect(mockGovernance.findOne.calledOnce).to.be.true
      expect(mockGovernance.findOne.calledWith(mockEvent.args.depositor)).to.be.true

      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockEvent.args.depositor, {
          tokenIds: ['123'],
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify getOrCreatePluginMetrics was called
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress: mockEvent.args.depositor,
          pluginAddress: mockPlugin.address,
          daoAddress: mockPlugin.daoAddress,
          network: mockInfo.network,
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify RabbitMQ message was sent
      expect(rabbitMQHelperStub.calledOnce).to.be.true
      expect(
        rabbitMQHelperStub.calledWith(EnumQueueName.daoMetrics, {
          id: mockPlugin.daoAddress,
          params: { address: mockPlugin.daoAddress, network: mockInfo.network },
        }),
      ).to.be.true

      // Verify logging
      expect(stubLogger.calledTwice).to.be.true
      expect(stubLogger.firstCall.calledWith('Deposit VeGovernance - Lock created' as any)).to.be.true
      expect(stubLogger.secondCall.calledWith('Deposit VeGovernance - Member and voting power updated' as any)).to.be
        .true
    })

    it('should create Lock with existing TokenMember and not update if tokenId already exists', async () => {
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
      sandbox.stub(Models.Lock, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const stubLockCreate = sandbox.stub(Models.Lock, 'create').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      // Mock governance instance with existing tokenId
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({ tokenIds: ['100', '123', '200'] }), // Already includes tokenId 123
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const stubMemberGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])

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

      // Verify Lock was created
      expect(stubLockCreate.calledOnce).to.be.true

      // Verify createBaseMember was called
      expect(stubCreateBaseMember.calledOnce).to.be.true

      // Verify governance methods were called
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true
      expect(mockGovernance.findOne.calledOnce).to.be.true

      // Verify update was NOT called since tokenId already exists
      expect(mockGovernance.update.notCalled).to.be.true

      // Verify getOrCreatePluginMetrics was called
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true

      // Verify RabbitMQ message was sent
      expect(rabbitMQHelperStub.calledOnce).to.be.true

      // Verify logging
      expect(stubLogger.calledTwice).to.be.true
      expect(stubLogger.firstCall.calledWith('Deposit VeGovernance - Lock created' as any)).to.be.true
      expect(stubLogger.secondCall.calledWith('Deposit VeGovernance - Member and voting power updated' as any)).to.be
        .true
    })

    it('should handle multiple plugins and call updatePluginMetrics for each', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress',
            exitQueueAddress: '0xExitQueueAddress',
          },
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xTokenAddress',
          votingEscrow: {
            escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
            nftLockAddress: '0xNftAddress',
            exitQueueAddress: '0xExitQueueAddress',
          },
        },
      ]
      sandbox.stub(Models.Plugin, 'find').resolves(mockPlugins)
      sandbox.stub(Models.Lock, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Lock, 'create').resolves()
      sandbox.stub(logger, 'verbose')

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({ tokenIds: [] } as any),
        findOne: sandbox.stub().resolves({ tokenIds: [] } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(utils, 'getUniqueValuesByKey').returns(['0xDaoAddress1', '0xDaoAddress2'])

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

      // Verify updatePluginMetrics was called for each plugin
      expect(mockGovernance.getOrCreatePluginMetrics.calledTwice).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.firstCall.calledWith({
          memberAddress: mockEvent.args.depositor,
          pluginAddress: mockPlugins[0].address,
          daoAddress: mockPlugins[0].daoAddress,
          network: mockInfo.network,
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.secondCall.calledWith({
          memberAddress: mockEvent.args.depositor,
          pluginAddress: mockPlugins[1].address,
          daoAddress: mockPlugins[1].daoAddress,
          network: mockInfo.network,
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify RabbitMQ messages were sent for both DAOs
      expect(rabbitMQHelperStub.calledTwice).to.be.true
    })

    it('should handle undefined blockTimestamp gracefully', async () => {
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
      sandbox.stub(Models.Lock, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(undefined) // Returns undefined
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const stubLockCreate = sandbox.stub(Models.Lock, 'create').resolves()
      sandbox.stub(logger, 'verbose')

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({ tokenIds: [] } as any),
        findOne: sandbox.stub().resolves({ tokenIds: [] } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])

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

      // Verify Lock.create was called with undefined blockTimestamp
      expect(stubLockCreate.calledOnce).to.be.true
      const lockCreateArgs = stubLockCreate.firstCall.args[0]
      expect(lockCreateArgs.blockTimestamp).to.be.undefined
    })

    it('should handle null TokenMember gracefully', async () => {
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
      sandbox.stub(Models.Lock, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(Models.Lock, 'create').resolves()
      sandbox.stub(logger, 'verbose')

      // Mock governance instance that returns null for getOrCreate
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(null), // Returns null
        findOne: sandbox.stub().resolves(null), // Returns null
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([mockPlugin.daoAddress])

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

      // Verify getOrCreate was called
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true

      // Verify update was called even though tokenMember is null (it will try to update with the tokenId)
      expect(mockGovernance.update.calledOnce).to.be.true
    })
  })

  describe('withdraw', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'error')
      const stubLockFindLockMember = sandbox.stub(Models.Lock, 'findLockMember')
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

      expect(stubPluginFind.calledOnce).to.be.true
      expect(
        stubPluginFind.calledWith({
          'votingEscrow.escrowAddress': mockInfo.address,
          network: mockInfo.network,
        }),
      ).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for withdraw event' as any)).to.be.true
      expect(stubLockFindLockMember.notCalled).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
      expect(stubGovernanceCreate.notCalled).to.be.true
      expect(mockGovernance.update.notCalled).to.be.true
    })

    it('should log error if lock not found', async () => {
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
      sandbox.stub(Models.Lock, 'findLockMember').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

      // Mock governance instance (won't be called since lock not found)
      const mockGovernance = {
        update: sandbox.stub().resolves(),
      }
      const stubGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

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

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Lock not found for withdraw event' as any)).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
      expect(stubGovernanceCreate.notCalled).to.be.true
      expect(mockGovernance.update.notCalled).to.be.true
    })

    it('should skip if lockWithdraw already true', async () => {
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

      const mockExistingLock = {
        lockWithdraw: { status: true },
        update: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

      // Mock governance instance (won't be called since lockWithdraw is already true)
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({ tokenIds: [] } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      const stubGovernanceCreate = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

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

      // Should return early, so no methods should be called
      expect(mockExistingLock.update.notCalled).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
      expect(stubGovernanceCreate.notCalled).to.be.true
      expect(mockGovernance.update.notCalled).to.be.true
      expect(mockGovernance.getOrCreate.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should update lock and call createMember and updateTokenMemberVP', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockWithdraw: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({
          tokenIds: ['100', '123', '200'],
        } as any),
        findOne: sandbox.stub().resolves({
          tokenIds: ['100', '123', '200'],
        } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
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

      // Verify existingLock.update was called with correct params
      expect(stubUpdate.calledOnce).to.be.true
      expect(
        stubUpdate.calledWith({
          lockWithdraw: {
            status: true,
            transactionHash: mockInfo.transactionHash,
            blockNumber: mockInfo.blockNumber,
            blockTimestamp: 1650009999,
            totalLocked: '20000',
            amount: '5000',
            epochEndAt: 1650005000,
          },
        }),
      ).to.be.true

      // Verify createBaseMember was called
      expect(stubCreateMember.calledOnce).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.depositor, mockInfo.blockNumber)).to.be.true

      // Verify findOne was called (withdraw uses findOne, not getOrCreate)
      expect(mockGovernance.findOne.calledOnce).to.be.true
      expect(mockGovernance.findOne.calledWith(mockEvent.args.depositor)).to.be.true

      // Verify update was called with tokenId removed
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockEvent.args.depositor, {
          votingPower: undefined, // votingPower is undefined when tokenIds remain
          tokenIds: ['100', '200'], // '123' removed
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify getOrCreatePluginMetrics was called
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress: mockEvent.args.depositor,
          pluginAddress: mockPlugin.address,
          daoAddress: mockPlugin.daoAddress,
          network: mockInfo.network,
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify logging
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Withdraw VeGovernance' as any)).to.be.true
    })

    it('should set votingPower to 0 when no tokenIds remain after withdrawal', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockWithdraw: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance - Only one tokenId exists, which will be removed
      const mockGovernance = {
        findOne: sandbox.stub().resolves({
          tokenIds: ['123'],
        } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
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

      // Verify update was called with votingPower: '0' when no tokenIds remain
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockEvent.args.depositor, {
          votingPower: '0',
          tokenIds: [],
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true
    })

    it('should handle undefined blockTimestamp gracefully', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockWithdraw: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(undefined) // Returns undefined
      sandbox.stub(logger, 'verbose')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({
          tokenIds: ['123'],
        }),
        update: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
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

      // Verify update was called with undefined blockTimestamp
      expect(stubUpdate.calledOnce).to.be.true
      const updateArgs = stubUpdate.firstCall.args[0]
      expect(updateArgs.lockWithdraw.blockTimestamp).to.be.undefined
    })

    it('should handle tokenId not found in tokenIds array', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockWithdraw: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance - tokenId 123 is not in the array
      const mockGovernance = {
        findOne: sandbox.stub().resolves({
          tokenIds: ['100', '200'],
        } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
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

      // Verify update was called with same tokenIds (nothing removed)
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockEvent.args.depositor, {
          votingPower: undefined,
          tokenIds: ['100', '200'],
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true
    })

    it('should handle empty tokenIds array', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockWithdraw: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance - TokenMember has undefined tokenIds
      const mockGovernance = {
        findOne: sandbox.stub().resolves({
          tokenIds: undefined,
        } as any),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
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

      // Verify update was called with votingPower: '0' for empty array
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith(mockEvent.args.depositor, {
          votingPower: '0',
          tokenIds: [],
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true
    })
  })

  describe('exitQueued', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'error')
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

      expect(stubPluginFind.calledOnce).to.be.true
      expect(
        stubPluginFind.calledWith({
          'votingEscrow.exitQueueAddress': mockInfo.address,
          network: mockInfo.network,
        }),
      ).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Plugin not found for exitQueued event' as any)).to.be.true
      expect(stubLockFindLockMember.notCalled).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
    })

    it('should log error if lock not found', async () => {
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
      sandbox.stub(Models.Lock, 'findLockMember').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'error')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

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
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 999n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Lock not found for exitQueued event' as any)).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
    })

    it('should skip if lockExit already true', async () => {
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

      const mockExistingLock = {
        lockExit: { status: true },
        update: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp')

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
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Should return early, so no methods should be called
      expect(mockExistingLock.update.notCalled).to.be.true
      expect(stubCreateMember.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
      // getBlockTimestamp should be called before the early return
      expect(stubGetBlockTimestamp.calledOnce).to.be.true
    })

    it('should update lock and call createMember', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockExit: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)

      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubCreateMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance for updatePluginMetrics
      const mockGovernance = {
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

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
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify existingLock.update was called with correct params
      expect(stubUpdate.calledOnce).to.be.true
      expect(
        stubUpdate.calledWith({
          lockExit: {
            status: true,
            transactionHash: mockInfo.transactionHash,
            blockNumber: mockInfo.blockNumber,
            blockTimestamp: 1650009999,
            exitDateAt: 1650010000,
          },
        }),
      ).to.be.true

      // Verify createBaseMember was called
      expect(stubCreateMember.calledOnce).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.holder, mockInfo.blockNumber)).to.be.true

      // Verify getOrCreatePluginMetrics was called
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress: mockEvent.args.holder,
          pluginAddress: mockPlugin.address,
          daoAddress: mockPlugin.daoAddress,
          network: mockInfo.network,
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Verify logging
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Exit queued VeGovernance' as any)).to.be.true
    })

    it('should handle undefined blockTimestamp gracefully', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockExit: { status: false },
        update: stubUpdate,
      }
      sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(undefined) // Returns undefined
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
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify update was called with undefined blockTimestamp
      expect(stubUpdate.calledOnce).to.be.true
      const updateArgs = stubUpdate.firstCall.args[0]
      expect(updateArgs.lockExit.blockTimestamp).to.be.undefined
    })

    it('should handle multiple plugins and use first one for finding lock', async () => {
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

      const stubUpdate = sandbox.stub().resolves()
      const mockExistingLock = {
        lockExit: { status: false },
        update: stubUpdate,
      }
      const stubFindLockMember = sandbox.stub(Models.Lock, 'findLockMember').resolves(mockExistingLock as any)
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
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      // Verify findLockMember was called with the correct params
      expect(stubFindLockMember.calledOnce).to.be.true
      expect(
        stubFindLockMember.calledWith({
          network: mockInfo.network,
          exitQueueAddress: mockInfo.address,
          tokenId: '123',
          memberAddress: mockEvent.args.holder,
        }),
      ).to.be.true

      // Verify update was called
      expect(stubUpdate.calledOnce).to.be.true
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
  })

  describe('minDepositSet', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'error')
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

      expect(stubPluginFind.calledOnce).to.be.true
      expect(
        stubPluginFind.calledWith({
          'votingEscrow.escrowAddress': mockInfo.address,
          network: mockInfo.network,
        }),
      ).to.be.true
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
  })

  describe('minLockSet', () => {
    it('should skip if plugin not found', async () => {
      const stubPluginFind = sandbox.stub(Models.Plugin, 'find').resolves([])
      const stubLogger = sandbox.stub(logger, 'error')
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
  })

  describe('delegateTokens', () => {
    it('should skip if no plugins found', async () => {
      const stubPluginFindAll = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xNonExistentToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubPluginFindAll.calledOnce).to.be.true
      expect(stubPluginFindAll.calledWith(mockInfo.address, mockInfo.network)).to.be.true
      expect(stubHandleTokenDelegation.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should skip if plugins is null', async () => {
      const stubPluginFindAll = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(null as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should handle self-delegation and skip incoming delegation', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Same as sender
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Should only handle outgoing delegation
      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(
        stubHandleTokenDelegation.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.sender,
          ITransferSide.outgoing,
          [mockPlugin],
          ['123'],
        ),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Self-delegation detected, skipping incoming delegation handling' as any)).to.be.true
    })

    it('should handle normal delegation with both outgoing and incoming', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Should handle both outgoing and incoming delegations
      expect(stubHandleTokenDelegation.calledTwice).to.be.true

      // First call - outgoing from sender
      expect(
        stubHandleTokenDelegation.firstCall.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.sender,
          ITransferSide.outgoing,
          [mockPlugin],
          ['123', '456'],
        ),
      ).to.be.true

      // Second call - incoming to delegatee
      expect(
        stubHandleTokenDelegation.secondCall.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.delegatee,
          ITransferSide.incoming,
          [mockPlugin],
          ['123', '456'],
        ),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Delegate tokens VeGovernance' as any)).to.be.true
    })

    it('should handle multiple plugins', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xToken',
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xToken',
        },
      ]
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledTwice).to.be.true
      // Verify plugins array is passed correctly
      expect(stubHandleTokenDelegation.firstCall.args[4]).to.deep.equal(mockPlugins)
      expect(stubHandleTokenDelegation.secondCall.args[4]).to.deep.equal(mockPlugins)
    })

    it('should log error when _handleTokenDelegation throws', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox
        .stub(GovernanceVeHandler, '_handleTokenDelegation')
        .rejects(new Error('Delegation failed'))
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('DelegateTokens error' as any)).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should convert bigint tokenIds to strings', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [9999999999999999999n, 1111111111111111111n], // Large bigints
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Verify tokenIds are converted to strings
      const expectedTokenIds = ['9999999999999999999', '1111111111111111111']
      expect(stubHandleTokenDelegation.firstCall.args[5]).to.deep.equal(expectedTokenIds)
      expect(stubHandleTokenDelegation.secondCall.args[5]).to.deep.equal(expectedTokenIds)
    })
  })

  describe('unDelegateTokens', () => {
    it('should skip if no plugins found', async () => {
      const stubPluginFindAll = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xNonExistentToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubPluginFindAll.calledOnce).to.be.true
      expect(stubPluginFindAll.calledWith(mockInfo.address, mockInfo.network)).to.be.true
      expect(stubHandleTokenDelegation.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should skip if plugins is null', async () => {
      const stubPluginFindAll = sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(null as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should handle self-undelegation and skip incoming delegation', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Same as sender
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Should only handle outgoing delegation
      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(
        stubHandleTokenDelegation.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.delegatee, // Note: fromAddress is delegatee in unDelegate
          ITransferSide.outgoing,
          [mockPlugin],
          ['123'],
        ),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Self-delegation detected, skipping delegation handling' as any)).to.be.true
    })

    it('should handle normal undelegation with both outgoing and incoming', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Should handle both outgoing and incoming delegations
      expect(stubHandleTokenDelegation.calledTwice).to.be.true

      // First call - outgoing from delegatee (note the swap in unDelegate)
      expect(
        stubHandleTokenDelegation.firstCall.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.delegatee, // fromAddress is delegatee
          ITransferSide.outgoing,
          [mockPlugin],
          ['123', '456'],
        ),
      ).to.be.true

      // Second call - incoming to sender (toAddress is sender)
      expect(
        stubHandleTokenDelegation.secondCall.calledWith(
          mockEvent,
          mockInfo,
          mockEvent.args.sender, // toAddress is sender
          ITransferSide.incoming,
          [mockPlugin],
          ['123', '456'],
        ),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Undelegate tokens VeGovernance' as any)).to.be.true
    })

    it('should handle multiple plugins', async () => {
      const mockPlugins = [
        {
          address: '0xPluginAddress1',
          daoAddress: '0xDaoAddress1',
          tokenAddress: '0xToken',
        },
        {
          address: '0xPluginAddress2',
          daoAddress: '0xDaoAddress2',
          tokenAddress: '0xToken',
        },
      ]
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves(mockPlugins as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledTwice).to.be.true
      // Verify plugins array is passed correctly
      expect(stubHandleTokenDelegation.firstCall.args[4]).to.deep.equal(mockPlugins)
      expect(stubHandleTokenDelegation.secondCall.args[4]).to.deep.equal(mockPlugins)
    })

    it('should log error when _handleTokenDelegation throws', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox
        .stub(GovernanceVeHandler, '_handleTokenDelegation')
        .rejects(new Error('Delegation failed'))
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('UnDelegateTokens error' as any)).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should convert bigint tokenIds to strings', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [9999999999999999999n, 1111111111111111111n], // Large bigints
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Verify tokenIds are converted to strings
      const expectedTokenIds = ['9999999999999999999', '1111111111111111111']
      expect(stubHandleTokenDelegation.firstCall.args[5]).to.deep.equal(expectedTokenIds)
      expect(stubHandleTokenDelegation.secondCall.args[5]).to.deep.equal(expectedTokenIds)
    })

    it('should swap sender and delegatee addresses correctly', async () => {
      const mockPlugin = {
        address: '0xPluginAddress',
        daoAddress: '0xDaoAddress',
        tokenAddress: '0xToken',
      }
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([mockPlugin] as any)
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation').resolves()
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any
      const mockEvent = {
        args: {
          sender: '0xAAA',
          delegatee: '0xBBB',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Verify the address swap: toAddress = sender, fromAddress = delegatee
      expect(stubHandleTokenDelegation.firstCall.args[2]).to.equal('0xBBB') // fromAddress is delegatee
      expect(stubHandleTokenDelegation.secondCall.args[2]).to.equal('0xAAA') // toAddress is sender
    })
  })

  describe('_handleTokenDelegation', () => {
    it('should skip if lastVPBlockNumber is greater than current block', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          lastVPBlockNumber: 200, // Greater than info.blockNumber (123)
          tokenIds: ['123'],
        }),
        update: sandbox.stub(),
        getOrCreatePluginMetrics: sandbox.stub(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp')

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        ['123'],
      )

      // Should create base member but not update voting power
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(mockGovernance.update.notCalled).to.be.true
      expect(stubGetBlockTimestamp.notCalled).to.be.true
    })

    it('should log error if token not found', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        ['123'],
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('handleTokenDelegation token not found' as any)).to.be.true
      expect(stubCreateBaseMember.notCalled).to.be.true
    })

    it('should handle self-delegation with incoming transfer side', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: null,
      } as any)

      // Mock MemberGovernanceFactory
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: ['789', '123'], // Already has 123
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Self-delegation
          tokenIds: [123n, 456n],
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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.incoming,
        [plugin],
        ['123', '456'],
      )

      // Verify createBaseMember called without lastActivity for incoming
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', undefined)).to.be.true

      // Verify voting power updated with deduplicated tokenIds
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(
        mockGovernance.update.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', {
          votingPower: '100',
          tokenIds: ['789', '123', '456'], // Deduplicated
          lastActivity: mockInfo.blockNumber,
        }),
      ).to.be.true

      // Should not update plugin metrics for incoming (no lastActivity)
      expect(mockGovernance.getOrCreatePluginMetrics.notCalled).to.be.true
    })

    it('should handle normal delegation with outgoing transfer side', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: ['123', '456', '789'],
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('50')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([plugin.daoAddress])

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        ['123', '456'],
      )

      // Verify createBaseMember called with lastActivity for outgoing
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', 123)).to.be.true

      // Verify voting power updated with filtered tokenIds
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(mockGovernance.update.firstCall.args[1].tokenIds).to.deep.equal(['789'])

      // Should update plugin metrics for outgoing
      expect(mockGovernance.getOrCreatePluginMetrics.calledOnce).to.be.true
      expect(
        mockGovernance.getOrCreatePluginMetrics.calledWith({
          memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: plugin.network,
          lastActivity: 123,
        }),
      ).to.be.true

      // Should send DAO metrics
      expect(rabbitMQHelperStub.calledOnce).to.be.true
      expect(
        rabbitMQHelperStub.calledWith(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: mockInfo.network },
        }),
      ).to.be.true
    })

    it('should handle normal delegation with incoming transfer side', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      const stubCreateBaseMember = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: ['789'],
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('150')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        ITransferSide.incoming,
        [plugin],
        ['123', '456'],
      )

      // Verify createBaseMember called without lastActivity for incoming
      expect(stubCreateBaseMember.calledOnce).to.be.true
      expect(stubCreateBaseMember.calledWith('0x75D9d3887aa9a9ee78901E96819B574160E4EAC6', undefined)).to.be.true

      // Verify voting power updated with added tokenIds
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(mockGovernance.update.firstCall.args[1].tokenIds).to.deep.equal(['789', '123', '456'])

      // Should not update plugin metrics for incoming (no lastActivity)
      expect(mockGovernance.getOrCreatePluginMetrics.notCalled).to.be.true
    })

    it('should handle undefined blockTimestamp gracefully', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: [],
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(undefined)
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        ITransferSide.incoming,
        [plugin],
        ['123'],
      )

      // Verify getPastVotes called with 0 when blockTimestamp is undefined
      expect(
        stubGetPastVotes.calledWith(
          '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          mockInfo.address,
          mockInfo.blockNumber,
          0, // Should pass 0 when blockTimestamp is undefined
          mockInfo.network,
          false as any, // clockMode from token
        ),
      ).to.be.true
    })

    it('should handle multiple plugins and send unique DAO metrics', async () => {
      const plugin2 = {
        id: 'test-plugin-2',
        address: '0x122',
        daoAddress: '0xDAO2',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
      } as any

      const plugin3 = {
        id: 'test-plugin-3',
        address: '0x123',
        daoAddress: '0xDAO', // Same DAO as plugin1
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
      } as any

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: ['789'],
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin, plugin2, plugin3])
      sandbox.stub(utils, 'getUniqueValuesByKey').returns(['0xDAO', '0xDAO2']) // Two unique DAOs

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin, plugin2, plugin3],
        ['123'],
      )

      // Verify updatePluginMetrics called for each plugin
      expect(mockGovernance.getOrCreatePluginMetrics.calledThrice).to.be.true

      // Verify RabbitMQ called only for unique DAOs
      expect(rabbitMQHelperStub.calledTwice).to.be.true
      expect(
        rabbitMQHelperStub.firstCall.calledWith(EnumQueueName.daoMetrics, {
          id: '0xDAO',
          params: { address: '0xDAO', network: mockInfo.network },
        }),
      ).to.be.true
      expect(
        rabbitMQHelperStub.secondCall.calledWith(EnumQueueName.daoMetrics, {
          id: '0xDAO2',
          params: { address: '0xDAO2', network: mockInfo.network },
        }),
      ).to.be.true
    })

    it('should handle empty tokenIds arrays', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()

      // Mock governance instance
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves(),
        findOne: sandbox.stub().resolves({
          tokenIds: undefined, // No existing tokenIds
        }),
        update: sandbox.stub().resolves(),
        getOrCreatePluginMetrics: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        ITransferSide.incoming,
        [plugin],
        [], // Empty tokenIds
      )

      // Verify voting power updated with empty array
      expect(mockGovernance.update.calledOnce).to.be.true
      expect(mockGovernance.update.firstCall.args[1].tokenIds).to.deep.equal([])
    })

    it('should catch and log errors', async () => {
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: false,
      } as any)

      // Mock MemberGovernanceFactory to throw error
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').rejects(new Error('Database error'))

      const stubLogger = sandbox.stub(logger, 'error')

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        ['123'],
      )

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error handling token delegation' as any)).to.be.true
    })

    it('should handle token with clockMode enabled', async () => {
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: IClockMode.Timestamp, // Clock mode is Timestamp
      } as any)
      const mockGovernance2 = {
        getOrCreate: sandbox.stub().resolves({
          tokenIds: [],
        }),
        update: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance2 as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        ITransferSide.incoming,
        [plugin],
        ['123'],
      )

      // Verify getPastVotes called with clockMode = IClockMode.Timestamp
      expect(stubGetPastVotes.calledOnce).to.be.true
      expect(
        stubGetPastVotes.calledWith(
          '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          mockInfo.address,
          mockInfo.blockNumber,
          1650009999,
          mockInfo.network,
          IClockMode.Timestamp, // clockMode should be IClockMode.Timestamp
        ),
      ).to.be.true
    })

    it('should handle token with clockMode as BlockNumber', async () => {
      sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        clockMode: IClockMode.BlockNumber, // Clock mode is BlockNumber
      } as any)
      const mockGovernance2 = {
        getOrCreate: sandbox.stub().resolves({
          tokenIds: [],
        }),
        update: sandbox.stub().resolves(),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance2 as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(utils, 'getUniqueValuesByKey').returns([])

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

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        ITransferSide.incoming,
        [plugin],
        ['123'],
      )

      // Verify getPastVotes called with clockMode = IClockMode.BlockNumber
      expect(stubGetPastVotes.calledOnce).to.be.true
      expect(
        stubGetPastVotes.calledWith(
          '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          mockInfo.address,
          mockInfo.blockNumber,
          1650009999,
          mockInfo.network,
          IClockMode.BlockNumber, // clockMode should be IClockMode.BlockNumber
        ),
      ).to.be.true
    })
  })
})
