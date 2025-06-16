import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { IPluginInterfaceType, IPluginStatus, ISettingStatus, ITokenType, NetworksEnum } from '@types'
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
import DbTx from '@modules/dbTx'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Handler:GovernanceVeHandler', () => {
  let sandbox: SinonSandbox
  let plugin: Plugin
  let activePluginSetting: PluginSetting | any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
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
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

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
      expect(stored?.pluginAddress).to.equal(plugin.address)
      expect(stored?.daoAddress).to.equal(plugin.daoAddress)
      expect(stored?.memberAddress).to.equal(mockEvent.args.depositor)
      expect(stored?.tokenAddress).to.equal(plugin.tokenAddress)
      expect(stored?.nftAddress).to.equal(plugin?.votingEscrow?.nftLockAddress)
      expect(stored?.escrowAddress).to.equal(plugin?.votingEscrow?.escrowAddress)
      expect(stored?.tokenId).to.equal(mockEvent.args.tokenId.toString())
      expect(stored?.amount).to.equal(mockEvent.args.value.toString())
      expect(stored?.epochStartAt).to.equal(Number(mockEvent.args.startTs))
      expect(stored?.totalLocked).to.equal(mockEvent.args.newTotalLocked.toString())
      expect(stored?.lockExit.status).to.be.false
      expect(stored?.lockWithdraw.status).to.be.false
      expect(stubLogger.calledOnce).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
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
          tokenId: 999n, // Non-existent tokenId
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
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'verbose')

      // First create a lock in the database
      const createdLock = await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginalHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
        lockExit: { status: false },
        lockWithdraw: { status: false },
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

      // Retrieve the updated lock from database
      const updatedLock = await Models.Lock.findById(createdLock._id)

      expect(updatedLock).to.exist
      expect(updatedLock?.lockWithdraw.status).to.be.true
      expect(updatedLock?.lockWithdraw.transactionHash).to.equal(mockInfo.transactionHash)
      expect(updatedLock?.lockWithdraw.blockNumber).to.equal(mockInfo.blockNumber)
      expect(updatedLock?.lockWithdraw.blockTimestamp).to.equal(1650009999)
      expect(updatedLock?.lockWithdraw.totalLocked).to.equal(mockEvent.args.newTotalLocked.toString())
      expect(updatedLock?.lockWithdraw.amount).to.equal(mockEvent.args.value.toString())
      expect(updatedLock?.lockWithdraw.epochEndAt).to.equal(Number(mockEvent.args.ts))
      expect(stubLogger.calledOnce).to.be.true
      expect(stubRemoveFromDao.calledOnce).to.be.true
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
          tokenId: 999n, // Non-existent tokenId
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

      // First create a lock in the database
      const createdLock = await Models.Lock.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginalHash',
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 100,
        blockTimestamp: 1650000000,
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        memberAddress: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        escrowAddress: plugin?.votingEscrow?.escrowAddress,
        nftAddress: plugin?.votingEscrow?.nftLockAddress,
        tokenAddress: plugin.tokenAddress,
        tokenId: '123',
        amount: '10000',
        epochStartAt: 1650000000,
        totalLocked: '25000',
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

      // Retrieve the updated lock from database
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
          minLock: 604800n, // 7 days in seconds
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

    it('should handle delegation for sender and delegatee', async () => {
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(ProxyMember, 'getBalances').resolves({
        increaseBalance: sandbox.stub().resolves({ amount: '2' }),
        decreaseBalance: sandbox.stub().resolves({ amount: '0' }),
      } as any)
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubUpdateDelegationMetrics = sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const stubIsMemberOfDao = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      const stubAddToDao = sandbox.stub(ProxyMember, 'addToDao').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: { commitTransaction: () => {}, endSession: () => {} } })
      })
      sandbox.stub(Models.MemberTransaction, 'create').resolves({
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        memberBalance: '0',
        votingPower: '100',
      })

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

      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.sender)).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.delegatee)).to.be.true
      expect(stubUpdateDelegationMetrics.calledTwice).to.be.true
      expect(stubUpdateActivity.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle errors and log them', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('Database error'))

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('DelegateTokens error' as any)).to.be.true
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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubLogger.notCalled).to.be.true
    })

    it('should handle undelegation for delegatee and sender', async () => {
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('50')
      sandbox.stub(ProxyMember, 'getBalances').resolves({
        increaseBalance: sandbox.stub().resolves({ amount: '1' }),
        decreaseBalance: sandbox.stub().resolves({ amount: '1' }),
      } as any)
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubUpdateDelegationMetrics = sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const stubIsMemberOfDao = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: { commitTransaction: () => {}, endSession: () => {} } })
      })
      sandbox.stub(Models.MemberTransaction, 'create').resolves({
        address: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        memberBalance: '1',
        votingPower: '50',
      })

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

      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.sender)).to.be.true
      expect(stubCreateMember.calledWith(mockEvent.args.delegatee)).to.be.true
      expect(stubUpdateDelegationMetrics.calledTwice).to.be.true
      expect(stubUpdateActivity.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle errors and log them', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(ProxyMember, 'createMember').rejects(new Error('Database error'))

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
      } as any

      const mockEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('UnDelegateTokens error' as any)).to.be.true
    })

    it('should handle membership removal when voting power becomes zero', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')
      sandbox.stub(ProxyMember, 'getBalances').resolves({
        increaseBalance: sandbox.stub().resolves({ amount: '1' }), // Add this
        decreaseBalance: sandbox.stub().resolves({ amount: '0' }),
      } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()

      sandbox.stub(Models.Plugin, 'findAllByTokenAddress').resolves([plugin])
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({ session: { commitTransaction: () => {}, endSession: () => {} } })
      })
      sandbox.stub(Models.MemberTransaction, 'create').resolves({
        address: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
        memberBalance: '0',
        votingPower: '0',
      })

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

      expect(stubRemoveFromDao.called).to.be.true
    })
  })
})
