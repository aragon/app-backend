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
      expect(stubLogger.calledOnce).to.be.true
      expect(stubAddToDao.calledOnce).to.be.true
    })

    it('should handle existing lock and log already exists', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyMember, 'addToDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      const stubLogger = sandbox.stub(logger, 'warn')

      // First create a lock in the database
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
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(true)
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

    it('should skip removeFromDao if member is not in DAO', async () => {
      const stubRemoveFromDao = sandbox.stub(ProxyMember, 'removeFromDao').resolves()
      sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(logger, 'verbose')

      // First create a lock in the database
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
        address: '0xExitQueue', // Use the exitQueueAddress, not escrowAddress
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

    it('should update all plugin settings', async () => {
      // Create a second plugin with same escrow address
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
          escrowAddress: '0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6', // Same escrow
          nftLockAddress: '0xNftToken2',
          exitQueueAddress: '0xExitQueue2',
        },
      })

      // Create setting for second plugin
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

      // Verify both settings were updated
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

    it('should skip processing if sender and delegatee are the same', async () => {
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
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Same as sender
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      expect(stubLogger.calledWith('Self-delegation detected, skipping processing' as any)).to.be.true
      expect(stubHandleTokenDelegation.notCalled).to.be.true
    })

    it('should create MemberTransactions for both sender and delegatee with correct tokenIds handling', async () => {
      // Arrange
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      // Stub voting power calls
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes')
      stubGetPastVotes.onFirstCall().resolves('50') // sender's voting power after delegation
      stubGetPastVotes.onSecondCall().resolves('150') // delegatee's voting power after delegation

      // Mock balance operations with tokenIds arrays
      const senderCurrentTokenIds = [100, 200, 123, 456] // sender's current tokens including ones being delegated
      const delegateeCurrentTokenIds = [300] // delegatee's current tokens

      const senderBalanceUpdate = sandbox.stub().resolves({ amount: '2' })
      const delegateeBalanceUpdate = sandbox.stub().resolves({ amount: '3' })

      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: senderCurrentTokenIds,
          update: senderBalanceUpdate,
        } as any)
        .onSecondCall()
        .resolves({
          tokenIds: delegateeCurrentTokenIds,
          update: delegateeBalanceUpdate,
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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      // Act
      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Assert - Verify MemberTransactions were created in the database
      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)

      const senderTx = allTransactions.find(tx => tx.address === mockEvent.args.sender)
      const delegateeTx = allTransactions.find(tx => tx.address === mockEvent.args.delegatee)

      // Verify sender transaction (tokens removed)
      expect(senderTx).to.exist
      expect(senderTx?.side).to.equal(ITransferSide.outgoing)
      expect(senderTx?.amount).to.equal('2') // remaining tokens after delegation
      expect(senderTx?.memberVotingPower).to.equal('50')

      // Verify delegatee transaction (tokens added)
      expect(delegateeTx).to.exist
      expect(delegateeTx?.side).to.equal(ITransferSide.incoming)
      expect(delegateeTx?.amount).to.equal('3') // total tokens after receiving delegation
      expect(delegateeTx?.memberVotingPower).to.equal('150')

      // Verify balance update calls
      expect(
        senderBalanceUpdate.calledWith({
          amount: '2',
          blockNumber: 123,
          tokenIds: [100, 200], // remaining tokens
        }),
      ).to.be.true

      expect(
        delegateeBalanceUpdate.calledWith({
          amount: '3',
          blockNumber: 123,
          tokenIds: [300, 123, 456], // original + new tokens
        }),
      ).to.be.true

      // Verify other method calls
      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle zero voting power and remove from DAO', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)

      // Zero voting power for sender after delegation
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').onFirstCall().resolves('0').onSecondCall().resolves('100')

      const senderBalanceUpdate = sandbox.stub().resolves({ amount: '0' })
      const delegateeBalanceUpdate = sandbox.stub().resolves({ amount: '1' })

      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: [123],
          update: senderBalanceUpdate,
        } as any)
        .onSecondCall()
        .resolves({
          tokenIds: [],
          update: delegateeBalanceUpdate,
        } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox
        .stub(ProxyMember, 'isMemberOfDao')
        .onFirstCall()
        .resolves(true) // sender is member
        .onSecondCall()
        .resolves(false) // delegatee is not member

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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Verify transactions were created with correct voting power
      const senderTx = await Models.MemberTransaction.findOne({
        transactionHash: mockInfo.transactionHash,
        address: mockEvent.args.sender,
      })

      expect(senderTx?.memberVotingPower).to.equal('0')
      expect(stubRemoveFromDao.calledOnce).to.be.true // sender removed due to 0 voting power
      expect(stubAddToDao.calledOnce).to.be.true // delegatee added
    })

    it('should handle multiple plugins and create proper DAO mappings', async () => {
      // Create a second plugin
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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.delegateTokens(mockEvent, mockInfo)

      // Verify transactions were created
      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2) // One for sender, one for delegatee
      expect(stubUpdateDelegationMetrics.callCount).to.equal(4) // 2 addresses * 2 plugins
      expect(stubUpdateActivity.callCount).to.equal(4) // 2 addresses * 2 plugins
      expect(rabbitMQHelperStub.callCount).to.equal(4) // 2 calls (outgoing + incoming) × 2 unique DAOs
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

    it('should skip processing if sender and delegatee are the same', async () => {
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
          delegatee: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5', // Same as sender
          tokenIds: [123n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      expect(stubLogger.calledWith('Self-undelegation detected, skipping processing' as any)).to.be.true
      expect(stubHandleTokenDelegation.notCalled).to.be.true
    })

    it('should create MemberTransactions for both delegatee and sender with correct tokenIds handling', async () => {
      // Arrange
      const stubCreateMember = sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      // Stub voting power calls
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes')
      stubGetPastVotes.onFirstCall().resolves('25') // delegatee's voting power after undelegation
      stubGetPastVotes.onSecondCall().resolves('75') // sender's voting power after getting tokens back

      // Mock balance operations with tokenIds arrays
      const delegateeCurrentTokenIds = [300, 123, 456] // delegatee's current tokens (including delegated ones)
      const senderCurrentTokenIds = [100] // sender's current tokens

      const delegateeBalanceUpdate = sandbox.stub().resolves({ amount: '1' })
      const senderBalanceUpdate = sandbox.stub().resolves({ amount: '3' })

      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: delegateeCurrentTokenIds,
          update: delegateeBalanceUpdate,
        } as any) // for delegatee (losing tokens)
        .onSecondCall()
        .resolves({
          tokenIds: senderCurrentTokenIds,
          update: senderBalanceUpdate,
        } as any) // for sender (getting tokens back)

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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      // Act
      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Assert - Verify MemberTransactions were created
      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2)

      const delegateeTx = allTransactions.find(tx => tx.address === mockEvent.args.delegatee)
      const senderTx = allTransactions.find(tx => tx.address === mockEvent.args.sender)

      // Verify delegatee transaction (losing tokens)
      expect(delegateeTx).to.exist
      expect(delegateeTx?.side).to.equal(ITransferSide.outgoing)
      expect(delegateeTx?.amount).to.equal('1')
      expect(delegateeTx?.memberVotingPower).to.equal('25')

      // Verify sender transaction (getting tokens back)
      expect(senderTx).to.exist
      expect(senderTx?.side).to.equal(ITransferSide.incoming)
      expect(senderTx?.amount).to.equal('3') // total tokens after getting delegation back
      expect(senderTx?.memberVotingPower).to.equal('75')

      // Verify other method calls
      expect(stubCreateMember.calledTwice).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should handle membership removal when voting power becomes zero', async () => {
      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
        hasClockMode: false,
      } as any)

      // Zero voting power for delegatee after undelegation
      sandbox
        .stub(GovernanceErc20Helper, 'getPastVotes')
        .onFirstCall()
        .resolves('0') // delegatee loses all voting power
        .onSecondCall()
        .resolves('100') // sender gains voting power back

      const delegateeBalanceUpdate = sandbox.stub().resolves({ amount: '0' })
      const senderBalanceUpdate = sandbox.stub().resolves({ amount: '1' })

      sandbox
        .stub(ProxyMember, 'getBalances')
        .onFirstCall()
        .resolves({
          tokenIds: [123],
          update: delegateeBalanceUpdate,
        } as any)
        .onSecondCall()
        .resolves({
          tokenIds: [],
          update: senderBalanceUpdate,
        } as any)

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox
        .stub(ProxyMember, 'isMemberOfDao')
        .onFirstCall()
        .resolves(true) // delegatee is member
        .onSecondCall()
        .resolves(false) // sender is not member

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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      sandbox.stub(logger, 'verbose')
      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Verify transactions were created with correct voting power
      const delegateeTx = await Models.MemberTransaction.findOne({
        transactionHash: mockInfo.transactionHash,
        address: mockEvent.args.delegatee,
      })

      expect(delegateeTx?.memberVotingPower).to.equal('0')
      expect(stubRemoveFromDao.calledOnce).to.be.true // delegatee removed due to 0 voting power
      expect(stubAddToDao.calledOnce).to.be.true // sender added back
    })

    it('should handle multiple plugins and create proper DAO mappings', async () => {
      // Create a second plugin
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
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n, 456n],
        },
      } as any

      await GovernanceVeHandler.unDelegateTokens(mockEvent, mockInfo)

      // Verify transactions were created
      const allTransactions = await Models.MemberTransaction.find({
        transactionHash: mockInfo.transactionHash,
      })

      expect(allTransactions).to.have.lengthOf(2) // One for delegatee, one for sender
      expect(stubUpdateDelegationMetrics.callCount).to.equal(4) // 2 addresses * 2 plugins
      expect(stubUpdateActivity.callCount).to.equal(4) // 2 addresses * 2 plugins
      expect(rabbitMQHelperStub.callCount).to.equal(4) // 2 calls (outgoing + incoming) × 2 unique DAOs
    })
  })

  describe('_handleTokenDelegation', () => {
    it('should handle token delegation with member transaction creation', async () => {
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

      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const transferSide = 'outgoing' as any
      const plugins = [plugin]
      const tokenIds = [123]

      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC721,
        isGovernance: true,
      } as any)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(ProxyMember, 'updateDelegationMetrics').resolves()
      sandbox.stub(ProxyMember, 'updateActivity').resolves()
      sandbox.stub(logger, 'verbose')

      const stubMemberTxCreate = sandbox.stub(Models.MemberTransaction, 'create').resolves({
        address: memberAddress,
        memberBalance: '1',
        memberVotingPower: '100',
      })

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        memberAddress,
        transferSide,
        plugins,
        tokenIds,
      )

      const memberExists = await Models.DaoMemberMapping.findOne({
        memberAddress,
        network: NetworksEnum.ethereumMainnet,
      })
      const memberDb = await Models.Member.findOne({
        address: memberAddress,
      })
      expect(memberDb).to.be.exist
      expect(memberExists).to.be.exist
      expect(stubMemberTxCreate.calledOnce).to.be.true
    })

    it('should handle when MemberTransaction already exists', async () => {
      const mockParsedEvent = {
        args: {
          sender: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
          delegatee: '0x75D9d3887aa9a9ee78901E96819B574160E4EAC6',
          tokenIds: [123n],
        },
      } as any

      const existingMemberTx = {
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        memberBalance: '1',
        memberVotingPower: '100',
      }

      const mockInfo = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 123,
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      } as any

      const getExistingMemberTx = sandbox.stub(Models.MemberTransaction, 'findExistingLog').resolves(existingMemberTx)
      const stubMemberTxCreate = sandbox.stub(ProxyMember, 'createMember')

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        [123],
      )

      expect(getExistingMemberTx.calledOnce).to.be.true
      expect(getExistingMemberTx.args[0][0]).to.deep.equal({
        network: NetworksEnum.ethereumMainnet,
        address: '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        transactionHash: '0xhash',
        transactionIndex: 1,
        logIndex: 1,
      })

      expect(stubMemberTxCreate.notCalled).to.be.true
    })

    it('should handle errors in token delegation', async () => {
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

      const memberAddress = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
      const transferSide = 'outgoing' as any
      const plugins = [plugin]
      const tokenIds = [123]

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

  describe('Error handling in main functions', () => {
    it('should handle ProxyToken.saveAndGetToken returning null in _handleTokenDelegation', async () => {
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

      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        [123],
      )

      expect(stubLogger.calledWith('handleTokenDelegation token not found' as any)).to.be.true
    })

    it('should handle database transaction failures in _handleTokenDelegation', async () => {
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

      sandbox.stub(ProxyMember, 'createMember').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ type: ITokenType.ERC721 } as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1650009999)
      sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('100')
      sandbox.stub(ProxyMember, 'getBalances').resolves({
        update: sandbox.stub().rejects(new Error('DB transaction failed')),
      } as any)

      const stubLogger = sandbox.stub(logger, 'error')

      await GovernanceVeHandler._handleTokenDelegation(
        mockParsedEvent,
        mockInfo,
        '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5',
        ITransferSide.outgoing,
        [plugin],
        [123],
      )

      expect(stubLogger.calledWith('Error handling token delegation' as any)).to.be.true
    })
  })
})
