import { Models } from '@dbModels'
import { PermissionHandler } from '@handlers/permissionHandler'
import { PluginHandler } from '@handlers/pluginHandler'
import ConditionDetector from '@helpers/conditionDetector'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import SafeProcessModule from '@modules/safe/safeProcess'
import { MemberGovernanceFactory } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { DaoList } from '@test/mock/fakeDao'
import { FakeDaoPermissions } from '@test/mock/fakeDaoPermission'
import { PluginList } from '@test/mock/fakePlugins'
import { fakeSettings } from '@test/mock/fakeSettings'
import {
  EnumQueueName,
  IConditionInterfaceType,
  IEventLogPermission,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Indexer: Permission Handler', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  describe('handleGrantOnDao', () => {
    const createExecuteEvent = async (
      daoAddress: string,
      safeAddress: string,
      network: NetworksEnum,
      event: IEventLogPermission,
      blockNumber: number,
      transactionHash: string,
      conditionAddress: string | null = null,
    ) => {
      if (!(await Models.Dao.findByAddress(daoAddress, network))) {
        await Models.Dao.create({ ...DaoList[0], address: daoAddress, network })
      }
      return Models.DaoPermission.create({
        ...FakeDaoPermissions[0],
        network,
        daoAddress,
        whereAddress: daoAddress,
        whoAddress: safeAddress,
        permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        event,
        blockNumber,
        transactionHash,
        transactionIndex: 0,
        logIndex: 0,
        conditionAddress,
      })
    }

    const createConditionPlugin = (conditionAddress: string | null = null) =>
      Models.Plugin.create({
        address: 'who',
        daoAddress: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'condition-plugin',
        blockNumber: 1,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.admin,
        conditionAddress,
        conditionInterfaceType: conditionAddress ? IConditionInterfaceType.executeSelector : null,
      })

    it('should handle grant on dao', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.callCount).to.eq(1)
      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle grant on dao and the admin member as well', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PROPOSAL_PERMISSION'),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('updates a conditional grant without clearing it', async () => {
      const conditionAddress = '0x1234567890123456789012345678901234567890'
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: conditionAddress,
        },
      } as any

      const info = {
        address: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      await createConditionPlugin()
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const findExistingLog = sandbox.spy(Models.DaoPermission, 'findExistingLog')
      const installPluginWithPermissionGrant = sandbox.spy(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.spy(PluginHandler, 'updateConditionAddress')
      const clearConditionAddress = sandbox.spy(PluginHandler, 'clearConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.calledOnce).to.be.true
      expect(updateConditionAddress.args[0][0]).to.equal('who')
      expect(updateConditionAddress.args[0][1]).to.equal('where')
      expect(updateConditionAddress.args[0][2]).to.equal(NetworksEnum.ethereumSepolia)
      expect(updateConditionAddress.args[0][3]).to.equal(conditionAddress)
      expect(clearConditionAddress.called).to.be.false
      const row = await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })
      expect(row).to.include({ event: IEventLogPermission.Granted, conditionAddress })
      expect(await Models.Plugin.findOne({ address: 'who' })).to.include({
        conditionAddress,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(loggerVerbose.calledTwice).to.be.true
    })

    it('should not call updateConditionAddress if condition is zero address', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: Utils.zeroAddress,
        },
      } as any

      const info = {
        address: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      await createConditionPlugin('0x1234567890123456789012345678901234567890')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const findExistingLog = sandbox.spy(Models.DaoPermission, 'findExistingLog')
      const installPluginWithPermissionGrant = sandbox.spy(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.spy(PluginHandler, 'updateConditionAddress')
      const clearConditionAddress = sandbox.spy(PluginHandler, 'clearConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.called).to.be.false
      expect(clearConditionAddress.calledOnceWithExactly('who', 'where', info.network)).to.be.true
      const row = await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })
      expect(row).to.include({ event: IEventLogPermission.Granted, conditionAddress: null })
      expect(await Models.Plugin.findOne({ address: 'who' })).to.include({
        conditionAddress: null,
        conditionInterfaceType: null,
      })
      expect(loggerVerbose.calledTwice).to.be.true
    })

    it('should not call updateConditionAddress if condition is 0x0000000000000000000000000000000000000002', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: '0x0000000000000000000000000000000000000002',
        },
      } as any

      const info = {
        address: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      await createConditionPlugin('0x1234567890123456789012345678901234567890')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const findExistingLog = sandbox.spy(Models.DaoPermission, 'findExistingLog')
      const installPluginWithPermissionGrant = sandbox.spy(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.spy(PluginHandler, 'updateConditionAddress')
      const clearConditionAddress = sandbox.spy(PluginHandler, 'clearConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.called).to.be.false
      expect(clearConditionAddress.calledOnceWithExactly('who', 'where', info.network)).to.be.true
      const row = await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })
      expect(row).to.include({ event: IEventLogPermission.Granted, conditionAddress: null })
      expect(await Models.Plugin.findOne({ address: 'who' })).to.include({
        conditionAddress: null,
        conditionInterfaceType: null,
      })
      expect(loggerVerbose.calledTwice).to.be.true
    })

    it('stores a foreign grant without changing the condition', async () => {
      const where = '0x1111111111111111111111111111111111111111'
      const who = '0x2222222222222222222222222222222222222222'
      const conditionAddress = '0x3333333333333333333333333333333333333333'
      const info = {
        address: '0x4444444444444444444444444444444444444444',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'foreign-grant',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 1212,
      } as any
      const parsedEvent = {
        args: { where, who, permissionId: ethers.id(IPermission.EXECUTE_PERMISSION), condition: conditionAddress },
      } as any
      const plugin = await Models.Plugin.create({
        address: who,
        daoAddress: where,
        network: info.network,
        transactionHash: 'existing-plugin',
        blockNumber: 1,
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.admin,
        conditionAddress: '0x5555555555555555555555555555555555555555',
      })
      const before = plugin.toObject()
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const updateConditionAddress = sandbox.spy(PluginHandler, 'updateConditionAddress')
      const clearConditionAddress = sandbox.spy(PluginHandler, 'clearConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(updateConditionAddress.called).to.be.false
      expect(clearConditionAddress.called).to.be.false
      expect((await Models.Plugin.findByEntityId(plugin.id)).toObject()).to.deep.equal(before)
      const row = await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })
      expect(row).to.include({
        daoAddress: info.address,
        whereAddress: where,
        whoAddress: who,
        event: IEventLogPermission.Granted,
        conditionAddress,
      })
    })

    it('should return if already exists', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(true)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.callCount).to.eq(1)
      expect(
        findExistingLog.calledWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          daoAddress: info.address,
        }),
      ).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(loggerVerbose.notCalled).to.be.true
    })

    it('should throw error', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerError = sandbox.stub(logger, 'error')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').rejects(new Error('fake-error'))

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(loggerError.calledOnce).to.be.true
    })

    for (const condition of ['0x2222222222222222222222222222222222222222', undefined]) {
      it(`records the grant and logs a failed condition ${condition ? 'update' : 'clear'}`, async () => {
        const plugin = await createConditionPlugin('0x3333333333333333333333333333333333333333')
        const before = plugin.toObject()
        const parsedEvent = {
          args: { where: 'where', who: 'who', permissionId: ethers.id('EXECUTE_PERMISSION'), condition },
        } as any
        const info = {
          address: 'where',
          network: NetworksEnum.ethereumSepolia,
          transactionHash: 'failed-condition',
          transactionIndex: 0,
          logIndex: 1,
          blockNumber: 1212,
        } as any
        sandbox.stub(logger, 'verbose')
        const errorLog = sandbox.stub(logger, 'error')
        sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
        sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
        sandbox.stub(DbOperations, 'updateDocument').resolves(null)
        const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

        await PermissionHandler.handleGrantOnDao(parsedEvent, info)

        expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })).to.include({
          daoAddress: 'where',
          whereAddress: 'where',
          whoAddress: 'who',
          network: info.network,
          event: IEventLogPermission.Granted,
          conditionAddress: condition ?? null,
        })
        expect((await Models.Plugin.findByEntityId(plugin.id)).toObject()).to.deep.equal(before)
        expect(errorLog.calledOnceWith('Error updating plugin condition' as any)).to.be.true
        expect(send.notCalled).to.be.true
      })
    }

    it('clears the stored condition when the DAO grants execute without a condition', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: undefined,
        },
      } as any

      const info = {
        address: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const plugin = await createConditionPlugin('0x3333333333333333333333333333333333333333')
      const handleForAdminPlugin = sandbox.spy(PermissionHandler, 'handleForAdminPlugin')
      const installPluginWithPermissionGrant = sandbox.spy(PluginHandler, 'installPluginOnPermissionGranted')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(handleForAdminPlugin.called).to.be.false
      expect(installPluginWithPermissionGrant.calledOnceWithExactly('where', 'who', info)).to.be.true
      expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({
        conditionAddress: null,
        conditionInterfaceType: null,
      })
      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })).to.include({
        daoAddress: 'where',
        whoAddress: 'who',
        event: IEventLogPermission.Granted,
        conditionAddress: null,
      })
    })

    it('should register a Safe only for execute granted on the DAO itself', async () => {
      const info = {
        address: '0x1111111111111111111111111111111111111111',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any
      const grant = (where: string) =>
        ({ args: { where, who: 'who', permissionId: ethers.id('EXECUTE_PERMISSION'), condition: undefined } }) as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')
      const installSafe = sandbox.stub(SafeProcessModule, 'install')

      await PermissionHandler.handleGrantOnDao(grant('0x2222222222222222222222222222222222222222'), info)
      await PermissionHandler.handleGrantOnDao(grant(info.address), info)

      expect(installSafe.calledOnceWith(info.address, 'who', info)).to.be.true
    })

    it('restores the Safe process after the Execute grant is stored', async () => {
      const daoAddress = DaoList[0].address
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      const info = {
        address: daoAddress,
        network,
        transactionHash: `0x${'b'.repeat(64)}`,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      const parsedEvent = {
        args: { where: daoAddress, who: safeAddress, permissionId: ethers.id(IPermission.EXECUTE_PERMISSION) },
      } as any
      await Models.Dao.create({ ...DaoList[0], network })
      await Models.Plugin.create({
        ...PluginList[0],
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.uninstalled,
        isProcess: false,
        isBody: false,
        tokenAddress: null,
      })
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'error')
      sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted').resolves()
      const reconcile = sandbox.stub(SafeDaoAssociationsModule, 'reconcileDao').callThrough()
      reconcile.onFirstCall().resolves({ changed: 0, failed: 0 })

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash }).lean()).to.include({
        event: IEventLogPermission.Granted,
        whoAddress: safeAddress,
        whereAddress: daoAddress,
      })
      expect(await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()).to.include({
        status: IPluginStatus.installed,
        isProcess: true,
      })
      expect(reconcile.callCount).to.equal(2)
      expect(reconcile.firstCall.args[3]).to.deep.equal({ safeAddress, event: IEventLogPermission.Granted })
      expect(reconcile.secondCall.calledWithExactly(daoAddress, network, info)).to.be.true
    })

    it('creates a Safe when replay finds a persisted Execute grant after the first install failed', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      const transactionHash = `0x${'1'.repeat(64)}`
      const info = {
        address: daoAddress,
        network,
        transactionHash,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10, transactionHash)
      const parsedEvent = {
        args: { where: daoAddress, who: safeAddress, permissionId: ethers.id(IPermission.EXECUTE_PERMISSION) },
      } as any
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')
      sandbox.stub(SafeChainReaderModule, 'isSafe').resolves(true)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      sandbox.stub(SafeBodyMembersModule, 'seedDao').resolves()
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()).to.include({
        status: IPluginStatus.installed,
        interfaceType: IPluginInterfaceType.safe,
        isProcess: true,
      })
      expect(await Models.DaoPermission.countDocuments({ transactionHash })).to.equal(1)
    })

    it('queues a conditional crawl when replaying the latest Execute grant', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const conditionAddress = '0x3333333333333333333333333333333333333333'
      const network = NetworksEnum.ethereumSepolia
      const transactionHash = `0x${'2'.repeat(64)}`
      const info = {
        address: daoAddress,
        network,
        transactionHash,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      await Models.Plugin.create({
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        transactionHash: `0x${'3'.repeat(64)}`,
        blockNumber: 1,
      })
      await createExecuteEvent(
        daoAddress,
        safeAddress,
        network,
        IEventLogPermission.Granted,
        10,
        transactionHash,
        conditionAddress,
      )
      const parsedEvent = {
        args: {
          where: daoAddress,
          who: safeAddress,
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
          condition: conditionAddress,
        },
      } as any
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')
      sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      sandbox.stub(SafeBodyMembersModule, 'seedDao').resolves()
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findOne({ address: safeAddress, daoAddress, network }).lean()).to.include({
        conditionAddress,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(send.calledTwice).to.be.true
      expect(send.firstCall.calledWith(EnumQueueName.safeRefresh)).to.be.true
      expect(send.secondCall.calledWith(EnumQueueName.logSelectorPermission)).to.be.true
    })

    it('keeps the latest condition when an older Execute grant is replayed', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const oldCondition = '0x3333333333333333333333333333333333333333'
      const latestCondition = '0x4444444444444444444444444444444444444444'
      const network = NetworksEnum.ethereumSepolia
      const oldHash = `0x${'4'.repeat(64)}`
      const plugin = await Models.Plugin.create({
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        conditionAddress: latestCondition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
        transactionHash: `0x${'5'.repeat(64)}`,
        blockNumber: 1,
      })
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10, oldHash, oldCondition)
      await createExecuteEvent(
        daoAddress,
        safeAddress,
        network,
        IEventLogPermission.Granted,
        11,
        `0x${'6'.repeat(64)}`,
        latestCondition,
      )
      const info = {
        address: daoAddress,
        network,
        transactionHash: oldHash,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      const parsedEvent = {
        args: {
          where: daoAddress,
          who: safeAddress,
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
          condition: oldCondition,
        },
      } as any
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')
      const detect = sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect((await Models.Plugin.findById(plugin._id)).conditionAddress).to.equal(latestCondition)
      expect(detect.notCalled).to.be.true
      expect(send.notCalled).to.be.true
    })

    it('leaves a Safe retired when an older grant is replayed after a revoke', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const oldCondition = '0x3333333333333333333333333333333333333333'
      const network = NetworksEnum.ethereumSepolia
      const oldHash = `0x${'8'.repeat(64)}`
      const plugin = await Models.Plugin.create({
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isProcess: true,
        isBody: false,
        conditionAddress: oldCondition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
        transactionHash: `0x${'9'.repeat(64)}`,
        blockNumber: 1,
      })
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Granted, 10, oldHash, oldCondition)
      await createExecuteEvent(daoAddress, safeAddress, network, IEventLogPermission.Revoked, 11, `0x${'a'.repeat(64)}`)
      const info = {
        address: daoAddress,
        network,
        transactionHash: oldHash,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      const parsedEvent = {
        args: {
          where: daoAddress,
          who: safeAddress,
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
          condition: oldCondition,
        },
      } as any
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findById(plugin._id).lean()).to.include({
        status: IPluginStatus.uninstalled,
        isProcess: false,
        conditionAddress: null,
        conditionInterfaceType: null,
      })
      expect(await Models.DaoPermission.countDocuments({ daoAddress, whoAddress: safeAddress })).to.equal(2)
    })

    const createSavedExecuteEvent = (
      event: IEventLogPermission,
      blockNumber: number,
      conditionAddress: string | null,
    ) =>
      Models.DaoPermission.create({
        ...FakeDaoPermissions[0],
        network: NetworksEnum.ethereumSepolia,
        daoAddress: 'where',
        whereAddress: 'where',
        whoAddress: 'who',
        permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        event,
        blockNumber,
        transactionHash: `0x${'b'.repeat(64)}`,
        transactionIndex: 0,
        logIndex: 0,
        conditionAddress,
      })

    const lostGrant = (conditionAddress: string | undefined) => ({
      parsedEvent: {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
          condition: conditionAddress,
        },
      } as any,
      info: {
        address: 'where',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: `0x${'c'.repeat(64)}`,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any,
    })

    it('keeps the newer condition when a lost grant comes back after a newer grant is saved', async () => {
      const oldCondition = '0x3333333333333333333333333333333333333333'
      const latestCondition = '0x4444444444444444444444444444444444444444'
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const detect = sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const plugin = await createConditionPlugin(latestCondition)
      await createSavedExecuteEvent(IEventLogPermission.Granted, 11, latestCondition)
      const { parsedEvent, info } = lostGrant(oldCondition)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({
        conditionAddress: latestCondition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })).to.include({
        event: IEventLogPermission.Granted,
        conditionAddress: oldCondition,
      })
      expect(detect.notCalled).to.be.true
      expect(send.notCalled).to.be.true
    })

    it('keeps the newer condition when a grant lands while replay owners are being seeded', async () => {
      const daoAddress = DaoList[0].address
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const oldCondition = '0x3333333333333333333333333333333333333333'
      const latestCondition = '0x4444444444444444444444444444444444444444'
      const network = NetworksEnum.ethereumSepolia
      const info = {
        address: daoAddress,
        network,
        transactionHash: `0x${'a'.repeat(64)}`,
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 10,
      } as any
      const newerInfo = { ...info, blockNumber: 11, transactionHash: `0x${'b'.repeat(64)}` }
      const grant = (condition: string) =>
        ({
          args: {
            where: daoAddress,
            who: safeAddress,
            permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
            condition,
          },
        }) as any
      await createExecuteEvent(
        daoAddress,
        safeAddress,
        network,
        IEventLogPermission.Granted,
        10,
        info.transactionHash,
        oldCondition,
      )
      const plugin = await Models.Plugin.create({
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isBody: false,
        isProcess: true,
        conditionAddress: oldCondition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
        transactionHash: 'replay-condition-plugin',
        blockNumber: 1,
      })
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      let finishSeed!: () => void
      let startSeed!: () => void
      const blocked = new Promise<void>(resolve => {
        finishSeed = resolve
      })
      const started = new Promise<void>(resolve => {
        startSeed = resolve
      })
      const seed = sandbox.stub(SafeBodyMembersModule, 'seedDao').resolves()
      seed.onFirstCall().callsFake(async () => {
        startSeed()
        await blocked
      })

      const replay = PermissionHandler.handleGrantOnDao(grant(oldCondition), info)
      try {
        await started
        await PermissionHandler.handleGrantOnDao(grant(latestCondition), newerInfo)
        expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({ conditionAddress: latestCondition })
        expect(await Models.DaoPermission.findOne({ transactionHash: newerInfo.transactionHash })).to.include({
          event: IEventLogPermission.Granted,
          conditionAddress: latestCondition,
        })
      } finally {
        finishSeed()
        await replay
      }

      expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({
        conditionAddress: latestCondition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(await Models.DaoPermission.countDocuments({ daoAddress, whoAddress: safeAddress })).to.equal(2)
    })

    it('keeps the condition when a lost grant comes back after a newer revoke is saved', async () => {
      const condition = '0x3333333333333333333333333333333333333333'
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const plugin = await createConditionPlugin(condition)
      await createSavedExecuteEvent(IEventLogPermission.Revoked, 11, null)
      const { parsedEvent, info } = lostGrant(undefined)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({
        conditionAddress: condition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })).to.include({
        event: IEventLogPermission.Granted,
        conditionAddress: null,
      })
    })

    it('sets the condition from a fresh grant when nothing newer is saved', async () => {
      const condition = '0x3333333333333333333333333333333333333333'
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      sandbox.stub(ConditionDetector, 'detect').resolves(IConditionInterfaceType.executeSelector)
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const plugin = await createConditionPlugin()
      const { parsedEvent, info } = lostGrant(condition)

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(await Models.Plugin.findByEntityId(plugin.id)).to.include({
        conditionAddress: condition,
        conditionInterfaceType: IConditionInterfaceType.executeSelector,
      })
      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash })).to.include({
        event: IEventLogPermission.Granted,
        conditionAddress: condition,
      })
      expect(
        send.calledOnceWithExactly(EnumQueueName.logSelectorPermission, {
          id: `${plugin.id}-${condition}`,
          params: {
            address: 'who',
            network: NetworksEnum.ethereumSepolia,
            daoAddress: 'where',
            conditionAddress: condition,
          },
        }),
      ).to.be.true
    })

    it('should call handleDaoLinkingOnGrant for PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID', async () => {
      const parsedEvent = {
        args: {
          where: '0x1111111111111111111111111111111111111111',
          who: '0x2222222222222222222222222222222222222222',
          permissionId: ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash-grant-parent',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const handleDaoLinkingStub = sandbox.stub(PermissionHandler, 'handleDaoLinkingOnGrant').resolves()

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(handleDaoLinkingStub.calledOnce).to.be.true
      expect(handleDaoLinkingStub.args[0][0]).to.eq(parsedEvent.args.where)
      expect(handleDaoLinkingStub.args[0][1]).to.eq(parsedEvent.args.who)
      expect(handleDaoLinkingStub.args[0][2]).to.eq(parsedEvent.args.permissionId)
      expect(handleDaoLinkingStub.args[0][3]).to.eq(info.network)
    })

    it('should call handleDaoLinkingOnGrant for SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID', async () => {
      const parsedEvent = {
        args: {
          where: '0x2222222222222222222222222222222222222222',
          who: '0x1111111111111111111111111111111111111111',
          permissionId: ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash-grant-sub',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const handleDaoLinkingStub = sandbox.stub(PermissionHandler, 'handleDaoLinkingOnGrant').resolves()

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(handleDaoLinkingStub.calledOnce).to.be.true
    })
  })

  describe('handleRevokeOnDao', () => {
    it('retries a failed Safe association update after storing a fresh Execute revoke', async () => {
      const daoAddress = DaoList[0].address
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      await Models.Dao.create({ ...DaoList[0], network })
      await Models.Plugin.create({
        ...PluginList[0],
        id: 'spp-parent',
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.spp,
        status: IPluginStatus.installed,
      })
      await Models.Setting.create({
        ...fakeSettings,
        daoAddress,
        network,
        pluginAddress: PluginList[0].address,
        status: ISettingStatus.active,
        stages: [{ stageIndex: 0, plugins: [{ address: safeAddress, brandId: VotingBodyBrandIdentity.SAFE }] }],
      })
      const row = await Models.Plugin.create({
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isBody: true,
        isProcess: true,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      await Models.DaoPermission.create({
        ...FakeDaoPermissions[0],
        daoAddress,
        whereAddress: daoAddress,
        whoAddress: safeAddress,
        network,
        permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        event: IEventLogPermission.Granted,
        blockNumber: 10,
        transactionHash: `0x${'1'.repeat(64)}`,
        transactionIndex: 0,
        logIndex: 0,
      })
      const info = {
        address: daoAddress,
        network,
        transactionHash: `0x${'2'.repeat(64)}`,
        blockNumber: 11,
        transactionIndex: 0,
        logIndex: 0,
      } as any
      const parsedEvent = {
        args: {
          where: daoAddress,
          who: safeAddress,
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        },
      } as any
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'error')
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(PluginSlug, 'generateSlug').resolves('safe')
      const update = sandbox.stub(DbOperations, 'updateDocument').callThrough()
      update.onFirstCall().resolves(null)
      const reconcile = sandbox.spy(SafeDaoAssociationsModule, 'reconcileDao')

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(await Models.DaoPermission.findOne({ transactionHash: info.transactionHash }).lean()).to.include({
        daoAddress,
        whoAddress: safeAddress,
        whereAddress: daoAddress,
        event: IEventLogPermission.Revoked,
      })
      expect(reconcile.callCount).to.equal(2)
      expect(await reconcile.firstCall.returnValue).to.include({ failed: 1 })
      expect(await reconcile.secondCall.returnValue).to.include({ failed: 0 })
      expect(await Models.Plugin.findById(row._id).lean()).to.include({
        id: row.id,
        status: IPluginStatus.installed,
        isBody: true,
        isProcess: false,
      })
    })

    it('reconciles a replayed Execute revoke without writing another permission row', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const info = {
        address: daoAddress,
        network: NetworksEnum.ethereumSepolia,
        transactionHash: `0x${'7'.repeat(64)}`,
        transactionIndex: 1,
        logIndex: 2,
        blockNumber: 10,
      } as any
      const parsedEvent = {
        args: {
          where: daoAddress,
          who: '0x2222222222222222222222222222222222222222',
          permissionId: ethers.id(IPermission.EXECUTE_PERMISSION),
        },
      } as any
      sandbox.stub(Models.DaoPermission, 'findExistingLog').resolves({} as any)
      const reconcile = sandbox.stub(SafeDaoAssociationsModule, 'reconcileDao').resolves({ changed: 0, failed: 0 })

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(reconcile.calledOnceWithExactly(daoAddress, info.network, info)).to.be.true
      expect(await Models.DaoPermission.countDocuments()).to.equal(0)
    })

    it('a foreign Revoked on an installed Safe changes nothing', async () => {
      const daoAddress = '0x1111111111111111111111111111111111111111'
      const safeAddress = '0x2222222222222222222222222222222222222222'
      const info = {
        address: '0x3333333333333333333333333333333333333333',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any
      const parsedEvent = {
        args: { where: daoAddress, who: safeAddress, permissionId: ethers.id(IPermission.EXECUTE_PERMISSION) },
      } as any
      await Models.Plugin.create({
        id: 'safe-process',
        address: safeAddress,
        daoAddress,
        network: info.network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        transactionHash: '0xoldtx',
        blockNumber: 1,
      })
      sandbox.stub(logger, 'verbose')
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      const plugin = await Models.Plugin.findOne({ address: safeAddress, daoAddress, network: info.network }).lean()
      expect(plugin?.status).to.equal(IPluginStatus.installed)
      const permission = await Models.DaoPermission.findOne({ transactionHash: info.transactionHash }).lean()
      expect(permission).to.include({
        whoAddress: safeAddress,
        whereAddress: daoAddress,
        daoAddress: info.address,
        network: info.network,
        permissionId: parsedEvent.args.permissionId,
        event: IEventLogPermission.Revoked,
        blockNumber: info.blockNumber,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      })
    })

    it('should handle revoke on dao', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle revoke on dao and the admin member as well', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PROPOSAL_PERMISSION'),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(
        findExistingLog.calledWith({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          daoAddress: info.address,
        }),
      ).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle revoke with condition address', async () => {
      const conditionAddress = '0x1234567890123456789012345678901234567890'
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: conditionAddress,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const uninstallPluginWithPermissionRevoke = sandbox.stub(PluginHandler, 'uninstallPluginWithPermissionRevoke')

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(uninstallPluginWithPermissionRevoke.calledOnce).to.be.true
      expect(uninstallPluginWithPermissionRevoke.args[0][0]).to.equal('who')
      expect(uninstallPluginWithPermissionRevoke.args[0][1]).to.equal('where')
      expect(uninstallPluginWithPermissionRevoke.args[0][2]).to.equal(NetworksEnum.ethereumSepolia)
      expect(uninstallPluginWithPermissionRevoke.args[0][3]).to.deep.equal(info)
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle when execute permission is revoked', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')
      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const uninstallPluginWithPermissionRevoke = sandbox.stub(PluginHandler, 'uninstallPluginWithPermissionRevoke')

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(verboseStub.calledOnce).to.be.true
      expect(findExistingLog.called).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(uninstallPluginWithPermissionRevoke.calledOnce).to.be.true
      expect(uninstallPluginWithPermissionRevoke.args[0][0]).to.be.eq('who')
      expect(uninstallPluginWithPermissionRevoke.args[0][1]).to.be.eq('where')
    })

    it('should call handleDaoUnlinkingOnRevoke for PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID', async () => {
      const parsedEvent = {
        args: {
          where: '0x1111111111111111111111111111111111111111',
          who: '0x2222222222222222222222222222222222222222',
          permissionId: ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash-revoke-parent',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const handleDaoUnlinkingStub = sandbox.stub(PermissionHandler, 'handleDaoUnlinkingOnRevoke').resolves()

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(handleDaoUnlinkingStub.calledOnce).to.be.true
      expect(handleDaoUnlinkingStub.args[0][0]).to.eq(parsedEvent.args.where)
      expect(handleDaoUnlinkingStub.args[0][1]).to.eq(parsedEvent.args.who)
      expect(handleDaoUnlinkingStub.args[0][2]).to.eq(parsedEvent.args.permissionId)
      expect(handleDaoUnlinkingStub.args[0][3]).to.eq(info.network)
    })

    it('should call handleDaoUnlinkingOnRevoke for SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID', async () => {
      const parsedEvent = {
        args: {
          where: '0x2222222222222222222222222222222222222222',
          who: '0x1111111111111111111111111111111111111111',
          permissionId: ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID),
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash-revoke-sub',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const handleDaoUnlinkingStub = sandbox.stub(PermissionHandler, 'handleDaoUnlinkingOnRevoke').resolves()

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(handleDaoUnlinkingStub.calledOnce).to.be.true
    })

    it('should return if already exists', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(true)

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(loggerVerbose.notCalled).to.be.true
    })

    it('should throw error', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
          condition: undefined,
        },
      } as any

      const info = {
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerError = sandbox.stub(logger, 'error')

      const handleForAdminPlugin = sandbox.stub(PermissionHandler, 'handleForAdminPlugin')
      sandbox.stub(Models.DaoPermission, 'findExistingLog').rejects(new Error('fake-error'))

      await PermissionHandler.handleRevokeOnDao(parsedEvent, info)

      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(loggerError.calledOnce).to.be.true
    })
  })

  describe('validateAndGetConditionAddress', () => {
    it('should return undefined for undefined condition', () => {
      const result = PermissionHandler.validateAndGetConditionAddress(undefined)
      expect(result).to.be.undefined
    })

    it('should return undefined for zero address', () => {
      const result = PermissionHandler.validateAndGetConditionAddress(Utils.zeroAddress)
      expect(result).to.be.undefined
    })

    it('should return undefined for 0x0000000000000000000000000000000000000002', () => {
      const result = PermissionHandler.validateAndGetConditionAddress('0x0000000000000000000000000000000000000002')
      expect(result).to.be.undefined
    })

    it('should return checksummed address for valid address', () => {
      const inputAddress = '0x1234567890123456789012345678901234567890'
      const result = PermissionHandler.validateAndGetConditionAddress(inputAddress)
      expect(result).to.equal(ethers.getAddress(inputAddress))
    })

    it('should return checksummed address for lowercase address', () => {
      const inputAddress = '0x1234567890123456789012345678901234567890'
      const lowerCaseAddress = inputAddress.toLowerCase()
      const result = PermissionHandler.validateAndGetConditionAddress(lowerCaseAddress)
      expect(result).to.equal(ethers.getAddress(inputAddress))
    })
  })

  describe('handleForAdminPlugin', () => {
    it('should handle for admin plugin when adding', async () => {
      const daoAddress = '0xaddress'
      const pluginAddress = '0xpluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const where = 'where'
      const add = true

      const findExistingLog = sandbox.stub(Models.Plugin, 'findOne').returns({
        daoAddress,
        network,
        address: pluginAddress,
        interfaceType: 'admin',
      })
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({}),
        delete: sandbox.stub().resolves(true),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const loggerVerbose = sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(factoryStub.calledOnce).to.be.true
      expect(mockGovernance.getOrCreate.calledOnce).to.be.true
      expect(mockGovernance.getOrCreate.calledWith(where)).to.be.true
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle for admin plugin when removing', async () => {
      const daoAddress = '0xaddress'
      const pluginAddress = '0xpluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const where = 'where'
      const add = false

      const findExistingLog = sandbox.stub(Models.Plugin, 'findOne').returns({
        daoAddress,
        network,
        address: pluginAddress,
        interfaceType: 'admin',
      })
      const mockGovernance = {
        getOrCreate: sandbox.stub().resolves({}),
        delete: sandbox.stub().resolves(true),
        updateDaoMetrics: sandbox.stub().resolves(),
      }
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const loggerInfo = sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(factoryStub.calledOnce).to.be.true
      expect(mockGovernance.delete.calledOnce).to.be.true
      expect(mockGovernance.delete.calledWith(where)).to.be.true
      expect(mockGovernance.updateDaoMetrics.calledOnce).to.be.true
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should return if not exists', async () => {
      const daoAddress = '0xaddress'
      const pluginAddress = '0xpluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const where = 'where'
      const add = true

      const findExistingLog = sandbox.stub(Models.Plugin, 'findOne').returns(null)
      const loggerInfo = sandbox.stub(logger, 'info')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(loggerInfo.notCalled).to.be.true
    })
  })

  describe('handleDaoLinkingOnGrant', () => {
    const network = NetworksEnum.ethereumSepolia
    const parentAccountAddress = '0x1111111111111111111111111111111111111111'
    const linkedAccountAddress = '0x2222222222222222222222222222222222222222'

    it('should link DAOs when parent triggers and child permission already exists', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves({ id: 'existing' } as any)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.calledOnce).to.be.true
      expect(linkDaosStub.calledWith(mockParentAccount, mockLinkedAccount, network)).to.be.true
    })

    it('should link DAOs when child triggers and parent permission already exists', async () => {
      const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves({ id: 'existing' } as any)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()

      await PermissionHandler.handleDaoLinkingOnGrant(
        linkedAccountAddress,
        parentAccountAddress,
        linkedToParentPermissionId,
        network,
      )

      expect(linkDaosStub.calledOnce).to.be.true
      expect(linkDaosStub.calledWith(mockParentAccount, mockLinkedAccount, network)).to.be.true
    })

    it('should not link when counterpart permission does not exist', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves(null)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when parent DAO is already a child', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: '0x3333333333333333333333333333333333333333',
        linkedAccounts: [],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when child DAO already has linked accounts (is a parent)', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: ['0x4444444444444444444444444444444444444444'],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when child DAO already has a different parent', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: '0x5555555555555555555555555555555555555555',
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should skip linking when one or both DAOs do not exist', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })
  })

  describe('handleDaoUnlinkingOnRevoke', () => {
    const network = NetworksEnum.ethereumSepolia
    const parentAccountAddress = '0x1111111111111111111111111111111111111111'
    const linkedAccountAddress = '0x2222222222222222222222222222222222222222'

    it('should unlink DAOs when permission is revoked', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [linkedAccountAddress],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: parentAccountAddress,
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(unlinkDaosStub.calledOnce).to.be.true
      expect(unlinkDaosStub.calledWith(mockParentAccount, mockLinkedAccount, network)).to.be.true
    })

    it('should not unlink if link does not exist', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(unlinkDaosStub.called).to.be.false
    })

    it('should unlink DAOs using SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID (else branch)', async () => {
      const linkedToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentAccount = {
        address: parentAccountAddress,
        parentAccount: null,
        linkedAccounts: [linkedAccountAddress],
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: parentAccountAddress,
        linkedAccounts: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentAccountAddress) return Promise.resolve(mockParentAccount)
        if (addr === linkedAccountAddress) return Promise.resolve(mockLinkedAccount)
        return Promise.resolve(null)
      })

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      // For linkedToParentPermissionId: where=linkedAccount, who=parentAccount
      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        linkedAccountAddress,
        parentAccountAddress,
        linkedToParentPermissionId,
        network,
      )

      expect(unlinkDaosStub.calledOnce).to.be.true
      expect(unlinkDaosStub.calledWith(mockParentAccount, mockLinkedAccount, network)).to.be.true
    })

    it('should return if DAOs not found', async () => {
      const parentToLinkedPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        parentAccountAddress,
        linkedAccountAddress,
        parentToLinkedPermissionId,
        network,
      )

      expect(unlinkDaosStub.called).to.be.false
    })
  })

  describe('linkDaos', () => {
    const network = NetworksEnum.ethereumSepolia
    const parentAccountAddress = '0x1111111111111111111111111111111111111111'
    const linkedAccountAddress = '0x2222222222222222222222222222222222222222'

    it('should link parent and child DAOs bidirectionally', async () => {
      const mockParentAccount = {
        address: parentAccountAddress,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(logger, 'info')

      await PermissionHandler.linkDaos(mockParentAccount as any, mockLinkedAccount as any, network)

      expect(mockLinkedAccount.update.calledOnce).to.be.true
      expect(mockParentAccount.update.calledOnce).to.be.true
    })

    it('should not update child if already linked to parent', async () => {
      const mockParentAccount = {
        address: parentAccountAddress,
        linkedAccounts: [],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: parentAccountAddress,
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(logger, 'info')

      await PermissionHandler.linkDaos(mockParentAccount as any, mockLinkedAccount as any, network)

      expect(mockLinkedAccount.update.called).to.be.false
      expect(mockParentAccount.update.calledOnce).to.be.true
    })

    it('should not add child if already in linkedAccounts', async () => {
      const mockParentAccount = {
        address: parentAccountAddress,
        linkedAccounts: [linkedAccountAddress],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: null,
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(logger, 'info')

      await PermissionHandler.linkDaos(mockParentAccount as any, mockLinkedAccount as any, network)

      expect(mockLinkedAccount.update.calledOnce).to.be.true
      expect(mockParentAccount.update.called).to.be.false
    })
  })

  describe('unlinkDaos', () => {
    const network = NetworksEnum.ethereumSepolia
    const parentAccountAddress = '0x1111111111111111111111111111111111111111'
    const linkedAccountAddress = '0x2222222222222222222222222222222222222222'

    it('should unlink parent and child DAOs bidirectionally', async () => {
      const mockParentAccount = {
        address: parentAccountAddress,
        linkedAccounts: [linkedAccountAddress],
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: parentAccountAddress,
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(logger, 'info')

      await PermissionHandler.unlinkDaos(mockParentAccount as any, mockLinkedAccount as any, network)

      expect(mockLinkedAccount.update.calledOnce).to.be.true
      expect(mockLinkedAccount.update.calledWith({ parentAccount: null } as any)).to.be.true
      expect(mockParentAccount.update.calledOnce).to.be.true
    })

    it('should handle empty linkedAccounts array', async () => {
      const mockParentAccount = {
        address: parentAccountAddress,
        linkedAccounts: null,
        update: sandbox.stub().resolves(),
      }
      const mockLinkedAccount = {
        address: linkedAccountAddress,
        parentAccount: parentAccountAddress,
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(logger, 'info')

      await PermissionHandler.unlinkDaos(mockParentAccount as any, mockLinkedAccount as any, network)

      expect(mockLinkedAccount.update.calledOnce).to.be.true
      expect(mockParentAccount.update.calledOnce).to.be.true
    })
  })
})
