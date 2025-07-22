import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, ITokenType, NetworksEnum, ITransferSide } from '@types'
import type Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import logger from '@logger'
import { GovernanceVeHandler } from '@handlers/governanceVeHandler'
import { expect } from 'chai'
import { ProxyMember } from '@modules/proxyMember'
import Web3Helper from '@helpers/web3'
import { PluginSetting } from '@models/schema/setting'
import { ProxyToken } from '@modules/proxyToken'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import RabbitMQHelper from '@helpers/rabbitMQ'
import DbOperations from '@models/utils/dbOperations'

describe.only('Handler:GovernanceVeHandler', () => {
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
    it('should log error if plugin not found', async () => {
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
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
      expect(stubAddToDao.notCalled).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found for deposit event' as any)).to.be.true
    })

    it('should create Lock and call logger/ProxyMember on success', async () => {
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const memberBalance = await Models.MemberBalance.create({
        network: NetworksEnum.ethereumMainnet,
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenAddress: plugin.tokenAddress,
        amount: '0',
        tokenIds: [],
        votingPower: '0',
      })

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo as any)

      const stored = await Models.Lock.findOne({ transactionHash: mockInfo.transactionHash })

      expect(stored).to.exist
      expect(stored?.transactionHash).to.equal(mockInfo.transactionHash)
      expect(stored?.transactionIndex).to.equal(mockInfo.transactionIndex)
      expect(stored?.logIndex).to.equal(mockInfo.logIndex)
      expect(stored?.blockNumber).to.equal(mockInfo.blockNumber)
      expect(stored?.blockTimestamp).to.equal(1650009999)
      expect(stored?.escrowAddress).to.equal(plugin?.votingEscrow?.escrowAddress)
      expect(stored?.exitQueueAddress).to.equal(plugin?.votingEscrow?.exitQueueAddress)
      expect(stored?.memberAddress).to.equal(mockEvent.args.depositor)
      expect(stored?.tokenAddress).to.equal(plugin.tokenAddress)
      expect(stored?.nftAddress).to.equal(plugin?.votingEscrow?.nftLockAddress)
      expect(stored?.tokenId).to.equal(mockEvent.args.tokenId.toString())
      expect(stored?.amount).to.equal(mockEvent.args.value.toString())
      expect(stored?.epochStartAt).to.equal(Number(mockEvent.args.startTs))
      expect(stored?.totalLocked).to.equal(mockEvent.args.newTotalLocked.toString())
      expect(stored?.lockExit.status).to.be.false
      expect(stored?.lockWithdraw.status).to.be.false
      expect(stubLogger.calledTwice).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
      expect(stubLogger.firstCall.args[0]).to.equal('Deposit VeGovernance - Lock created')
      expect(stubLogger.secondCall.args[0]).to.equal('Updated document - MemberBalance Update on deposit')

      const updatedBalance = await Models.MemberBalance.findById(memberBalance._id)
      expect(updatedBalance?.amount).to.equal('1')
      expect(updatedBalance?.tokenIds).to.deep.equal([])
    })

    it('should create Lock and update member balance on success', async () => {
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const memberBalance = await Models.MemberBalance.create({
        network: NetworksEnum.ethereumMainnet,
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenAddress: plugin.tokenAddress,
        amount: '2',
        tokenIds: [],
        votingPower: '0',
      })

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo as any)

      const stored = await Models.Lock.findOne({ transactionHash: mockInfo.transactionHash })
      expect(stored).to.exist

      const updatedBalance = await Models.MemberBalance.findById(memberBalance._id)
      expect(updatedBalance?.amount).to.equal('3')
      expect(updatedBalance?.tokenIds).to.deep.equal([])
      expect(updatedBalance?.lastSyncAmountBlockNumber).to.equal(123)

      expect(stubLogger.calledTwice).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
    })

    it('should handle existing lock and log already exists', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'warn')

      await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: plugin?.votingEscrow?.exitQueueAddress,
      })

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo as any)

      expect(stubLogger.calledWith('Deposit VeGovernance - Lock already exists' as any)).to.be.true
    })

    it('should skip addToDao if member is already in DAO', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xnewDeposit',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 124n,
          value: 10000n,
          startTs: 1650000000n,
          newTotalLocked: 25000n,
        },
      } as any

      await GovernanceVeHandler.deposit(mockEvent, mockInfo as any)

      expect(stubAddToDao.notCalled).to.be.true
    })
  })

  describe('withdraw', () => {
    it('should log error if plugin not found', async () => {
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
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

      expect(stubLogger.calledOnce).to.be.true
      expect(stubRemoveFromDao.calledOnce).to.be.false
      expect(stubLogger.calledOnceWith('Plugin not found for withdraw event' as any)).to.be.true
    })

    it('should log error if lock not found', async () => {
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 999n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo as any)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubRemoveFromDao.calledOnce).to.be.false
      expect(stubLogger.calledOnceWith('Lock not found for withdraw event' as any)).to.be.true
    })

    it('should update existing lock with withdraw info and call logger on success', async () => {
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const createdLock = await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginalHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: plugin?.votingEscrow?.exitQueueAddress,
        lockExit: { status: false },
        lockWithdraw: { status: false },
      })

      const memberBalance = await Models.MemberBalance.create({
        network: NetworksEnum.ethereumMainnet,
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenAddress: plugin.tokenAddress,
        amount: '3',
        tokenIds: ['100', '123', '200'],
        votingPower: '0',
      })

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo as any)

      const updatedLock = await Models.Lock.findById(createdLock._id)
      expect(updatedLock).to.exist
      expect(updatedLock?.lockWithdraw.status).to.be.true

      const updatedBalance = await Models.MemberBalance.findById(memberBalance._id)
      expect(updatedBalance?.amount).to.equal('2')
      expect(updatedBalance?.tokenIds).to.deep.equal(['100', '200'])
      expect(updatedBalance?.lastSyncAmountBlockNumber).to.equal(124)

      expect(stubLogger.calledTwice).to.be.true
      expect(stubRemoveFromDao.calledOnce).to.be.true
    })

    it('should skip removeFromDao if member is not in DAO', async () => {
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')

      await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginalHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '125',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: plugin?.votingEscrow?.exitQueueAddress,
        lockExit: { status: false },
        lockWithdraw: { status: false },
      })

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xwithdrawHash2',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          depositor: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 125n,
          value: 5000n,
          ts: 1650005000n,
          newTotalLocked: 20000n,
        },
      } as any

      await GovernanceVeHandler.withdraw(mockEvent, mockInfo as any)

      expect(stubRemoveFromDao.notCalled).to.be.true
    })
  })

  describe('exitQueued', () => {
    it('should log error if plugin not found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any
      const mockEvent = {
        args: {
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found for exitQueued event' as any)).to.be.true
    })

    it('should log error if lock not found', async () => {
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 999n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo as any)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Lock not found for exitQueued event' as any)).to.be.true
    })

    it('should update existing lock with exit info and call logger on success', async () => {
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const createdLock = await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginalHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        exitQueueAddress: plugin?.votingEscrow?.exitQueueAddress,
        lockExit: { status: false },
        lockWithdraw: { status: false },
      })

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 124,
        transactionHash: '0xexitQueuedHash',
        transactionIndex: 1,
        logIndex: 1,
      }
      const mockEvent = {
        args: {
          holder: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenId: 123n,
          exitDate: 1650010000n,
        },
      } as any

      await GovernanceVeHandler.exitQueued(mockEvent, mockInfo as any)

      const updatedLock = await Models.Lock.findById(createdLock._id)

      expect(updatedLock).to.exist
      expect(updatedLock?.lockExit.status).to.be.true
      expect(updatedLock?.lockExit.transactionHash).to.equal(mockInfo.transactionHash)
      expect(updatedLock?.lockExit.blockNumber).to.equal(mockInfo.blockNumber)
      expect(updatedLock?.lockExit.blockTimestamp).to.equal(1650009999)
      expect(updatedLock?.lockExit.exitDateAt).to.equal(Number(mockEvent.args.exitDate))
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('minLockSet', () => {
    it('should log error if plugin not found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          minLock: 86400n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found for minLockSet event' as any)).to.be.true
    })

    it('should log error if active plugin setting not found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          minLock: 86400n,
        },
      } as any

      await Models.Setting.deleteMany({})

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Active plugin setting not found for minLockSet event' as any)).to.be.true
    })

    it('should update activePluginSetting minLockTime and call logger on success', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0xExitQueue',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminLockHash',
      }

      const mockEvent = {
        args: {
          minLock: 604800n,
        },
      } as any

      await GovernanceVeHandler.minLockSet(mockEvent, mockInfo as any)

      const updatedSetting = await Models.Setting.findById(activePluginSetting._id)

      expect(updatedSetting).to.exist
      expect(updatedSetting?.votingEscrow?.minLockTime).to.equal(604800)
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('minDepositSet', () => {
    it('should log error if plugin not found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x001DdEdc2139d9948e8dcC936C1Ab2314D9181E8',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found for minDepositSet event' as any)).to.be.true
    })

    it('should log error if active plugin setting not found', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await Models.Setting.deleteMany({})

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Active plugin setting not found for minDepositSet event' as any)).to.be.true
    })

    it('should update activePluginSetting minDeposit and call logger on success', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xminDepositHash',
      }

      const mockEvent = {
        args: {
          minDeposit: 5000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo as any)

      const updatedSetting = await Models.Setting.findById(activePluginSetting._id)

      expect(updatedSetting).to.exist
      expect(updatedSetting?.votingEscrow?.minDeposit).to.equal('5000')
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should update all plugin settings', async () => {
      const plugin2 = await Models.Plugin.create({
        id: 'test-plugin-settings-2',
        address: '0x124',
        daoAddress: '0xDAO',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc4',
        blockNumber: 4,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      const setting2 = await Models.Setting.create({
        transactionHash: '0xsetting2Hash',
        blockNumber: 40941780,
        blockTimestamp: 1722523957,
        network: NetworksEnum.ethereumMainnet,
        status: ISettingStatus.active,
        pluginAddress: plugin2.address,
        votingEscrow: {
          minDeposit: '2000',
        },
      })

      const stubLogger = sandbox.stub(logger, 'verbose')

      const mockInfo = {
        address: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmultiSettingHash',
      }

      const mockEvent = {
        args: {
          minDeposit: 3000n,
        },
      } as any

      await GovernanceVeHandler.minDepositSet(mockEvent, mockInfo as any)

      const updatedSetting1 = await Models.Setting.findById(activePluginSetting._id)
      const updatedSetting2 = await Models.Setting.findById(setting2._id)

      expect(updatedSetting1?.votingEscrow?.minDeposit).to.equal('3000')
      expect(updatedSetting2?.votingEscrow?.minDeposit).to.equal('3000')
      expect(stubLogger.calledTwice).to.be.true
    })
  })

  describe('delegateTokens', () => {
    it('should return early if no plugins found', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])

      const mockInfo = {
        address: '0xNonExistentToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubLogger.notCalled).to.be.true
    })

    it('should process self-delegation and attach tokens to member balance', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should create MemberTransactions for both sender and delegatee with correct tokenIds handling', async () => {
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      const stubUpdateDocument = sandbox.stub(DbOperations, 'updateDocument').resolves()

      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes')
      stubGetPastVotes.onFirstCall().resolves('50')
      stubGetPastVotes.onSecondCall().resolves('150')

      const senderCurrentTokenIds = ['100', '200', '123', '456']
      const delegateeCurrentTokenIds = ['300']

      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: senderCurrentTokenIds,
        } as any)
        .onSecondCall()
        .resolves({
          tokenIds: delegateeCurrentTokenIds,
        } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xdelegateHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)

      const senderTx = allTransactions.find(tx => tx.address === mockEvent.args.sender)
      const delegateeTx = allTransactions.find(tx => tx.address === mockEvent.args.delegatee)

      expect(senderTx).to.exist
      expect(senderTx?.side).to.equal(ITransferSide.outgoing)
      expect(senderTx?.amount).to.equal('2')
      expect(senderTx?.memberVotingPower).to.equal('50')

      expect(delegateeTx).to.exist
      expect(delegateeTx?.side).to.equal(ITransferSide.incoming)
      expect(delegateeTx?.amount).to.equal('3')
      expect(delegateeTx?.memberVotingPower).to.equal('150')

      expect(stubUpdateDocument.calledTwice).to.be.true

      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle zero voting power and remove from DAO', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)

      sandbox.stub(DbOperations, 'updateDocument').resolves()

      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').onFirstCall().resolves('0').onSecondCall().resolves('100')
      const loggerStub = sandbox.stub(logger, 'verbose')
      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: [123],
        } as any)
        .onSecondCall()
        .resolves({
          tokenIds: [],
        } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').onFirstCall().resolves(true).onSecondCall().resolves(false)

      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xzeroVotingPowerHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      const senderTx = await Models.MemberTransaction.findOne({
        transactionHash: mockInfo.transactionHash,
        address: mockEvent.args.sender,
      })

      expect(senderTx?.memberVotingPower).to.equal('0')
      expect(stubRemoveFromDao.calledOnce).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should handle multiple plugins and create proper DAO mappings', async () => {
      const plugin2 = await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x122',
        daoAddress: '0xDAO2',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 2,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('50')

      const balanceUpdate = sandbox.stub().resolves({ amount: '1' })
      sandbox.stub(ProxyMember, 'getBalances').resolves({
        tokenIds: [123, 456],
        update: balanceUpdate,
      } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubUpdateDelegationMetrics = sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin, plugin2])
      sandbox.stub(DbOperations, 'updateDocument').resolves()

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmultiPluginHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)
      expect(stubUpdateDelegationMetrics.callCount).to.equal(4)
      expect(stubUpdateActivity.callCount).to.equal(4)
      expect(rabbitMQHelperStub.callCount).to.equal(4)
    })

    it('should log error when _handleTokenDelegation throws an error', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const stubHandleTokenDelegation = sandbox
        .stub(GovernanceVeHandler, '_handleTokenDelegation')
        .rejects(new Error('Delegation failed'))
      const stubLogger = sandbox.stub(logger, 'error')

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
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('DelegateTokens error' as any)).to.be.true
    })
  })

  describe('unDelegateTokens', () => {
    it('should return early if no plugins found', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([])

      const mockInfo = {
        address: '0xNonExistentToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubLogger.notCalled).to.be.true
    })

    it('should process self-undelegation and handle tokens correctly', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubHandleTokenDelegation = sandbox.stub(GovernanceVeHandler, '_handleTokenDelegation')

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should create MemberTransactions for both delegatee and sender with correct tokenIds handling', async () => {
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes')
      stubGetPastVotes.onFirstCall().resolves('0')
      stubGetPastVotes.onSecondCall().resolves('75')

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xundelegateHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)

      const delegateeTx = allTransactions.find(tx => tx.address === mockEvent.args.delegatee)
      const senderTx = allTransactions.find(tx => tx.address === mockEvent.args.sender)

      expect(delegateeTx).to.exist
      expect(delegateeTx?.side).to.equal(ITransferSide.outgoing)
      expect(delegateeTx?.amount).to.equal('0')

      expect(senderTx).to.exist
      expect(senderTx?.side).to.equal(ITransferSide.incoming)
      expect(senderTx?.amount).to.equal('2')
      expect(senderTx?.memberVotingPower).to.equal('75')

      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubLogger.called).to.be.true

      const memberBalance = await Models.MemberBalance.find({ tokenAddress: delegateeTx.tokenAddress })
      expect(memberBalance).to.have.lengthOf(2)
      expect(memberBalance[1].tokenIds[0].toString()).to.equal('123')
      expect(memberBalance[1].tokenIds[1].toString()).to.equal('456')
    })

    it('should handle membership removal when voting power becomes zero', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').onFirstCall().resolves('0').onSecondCall().resolves('100')

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').onFirstCall().resolves(true).onSecondCall().resolves(false)

      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const loggerStub = sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xzeroVotingPowerHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      const delegateeTx = await Models.MemberTransaction.findOne({
        transactionHash: mockInfo.transactionHash,
        address: mockEvent.args.delegatee,
      })

      expect(delegateeTx?.memberVotingPower).to.equal('0')
      expect(stubRemoveFromDao.calledOnce).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
      expect(loggerStub.called).to.be.true
    })

    it('should handle multiple plugins and create proper DAO mappings', async () => {
      const plugin2 = await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x122',
        daoAddress: '0xDAO2',
        tokenAddress: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        transactionHash: '0xabc2',
        blockNumber: 2,
        votingEscrow: {
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6',
          nftLockAddress: '0xNftToken2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('50')

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubUpdateDelegationMetrics = sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin, plugin2])

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xmultiPluginHash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)
      expect(stubUpdateDelegationMetrics.callCount).to.equal(4)
      expect(stubUpdateActivity.callCount).to.equal(4)
      expect(rabbitMQHelperStub.callCount).to.equal(4)
    })

    it('should log error when _handleTokenDelegation throws an error', async () => {
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      const stubHandleTokenDelegation = sandbox
        .stub(GovernanceVeHandler, '_handleTokenDelegation')
        .rejects(new Error('Delegation failed'))
      const stubLogger = sandbox.stub(logger, 'error')

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
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubHandleTokenDelegation.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('UnDelegateTokens error' as any)).to.be.true
    })
  })

  describe('_handleTokenDelegation', () => {
    it('should handle self-delegation by ensuring tokens are attached to member balance', async () => {
      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
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

      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const transferSide = ITransferSide.incoming
      const plugins = [plugin]
      const tokenIds = ['123', '456']

      await Models.MemberBalance.create({
        network: NetworksEnum.ethereumMainnet,
        address: memberAddress,
        tokenAddress: '0xToken',
        amount: '1',
        tokenIds: [789],
        votingPower: '0',
      })

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(DbOperations, 'updateDocument').resolves()

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        memberAddress,
        transferSide,
        plugins,
        tokenIds,
      )

      const createdTx = await Models.MemberTransaction.findOne({
        transactionHash: mockInfo.transactionHash,
        address: memberAddress,
      })

      expect(createdTx).to.exist
      expect(createdTx?.amount).to.equal('3')
      expect(createdTx?.memberVotingPower).to.equal('100')
    })

    it('should handle errors in token delegation', async () => {
      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9D3887Aa9A9ee78901E96819b574160e4EAC6',
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

      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const transferSide = 'outgoing' as any
      const plugins = [plugin]
      const tokenIds = ['123']

      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('Database error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        memberAddress,
        transferSide,
        plugins,
        tokenIds,
      )

      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('_handleDaoMemberShip', () => {
    it('should handle DAO membership addition when user has voting power', async () => {
      const memberTx = {
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        memberVotingPower: '100',
        memberBalance: '2',
      }
      const plugins = [plugin]
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShip(memberTx as any, plugins, mockInfo)

      expect(stubAddToDao.calledOnce).to.be.true
    })

    it('should handle DAO membership removal when user has no voting power', async () => {
      const memberTx = {
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        memberVotingPower: '0',
        memberBalance: '0',
      }
      const plugins = [plugin]
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShip(memberTx as any, plugins, mockInfo)

      expect(stubRemoveFromDao.calledOnce).to.be.true
    })

    it('should skip membership operations when already in correct state', async () => {
      const memberTx = {
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        memberVotingPower: '100',
        memberBalance: '2',
      }
      const plugins = [plugin]
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShip(memberTx as any, plugins, mockInfo)

      expect(stubAddToDao.notCalled).to.be.true
      expect(stubRemoveFromDao.notCalled).to.be.true
    })
  })

  describe('_handleDaoMemberShipOnLockEvents', () => {
    it('should add member to DAO when addToDao is true and member is not already a member', async () => {
      const plugins = [plugin]
      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, mockInfo, true)

      expect(stubAddToDao.calledOnce).to.be.true
    })

    it('should not add member to DAO when addToDao is true but member is already a member', async () => {
      const plugins = [plugin]
      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, mockInfo, true)

      expect(stubAddToDao.notCalled).to.be.true
    })

    it('should remove member from DAO when addToDao is false and member is currently a member', async () => {
      const plugins = [plugin]
      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, mockInfo, false)

      expect(stubRemoveFromDao.calledOnce).to.be.true
    })

    it('should not remove member from DAO when addToDao is false but member is not a member', async () => {
      const plugins = [plugin]
      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, mockInfo, false)

      expect(stubRemoveFromDao.notCalled).to.be.true
    })

    it('should send DAO metrics messages for unique DAOs', async () => {
      const plugin2 = { ...plugin, daoAddress: '0xDAO2' }
      const plugins = [plugin, plugin2]
      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const mockInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
      } as any

      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(ProxyMember, 'addToDao').resolves()

      await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins as any, memberAddress, mockInfo, true)

      expect(rabbitMQHelperStub.calledTwice).to.be.true
    })
  })
})
