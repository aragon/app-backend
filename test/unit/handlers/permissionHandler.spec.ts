import { Models } from '@dbModels'
import { PermissionHandler } from '@handlers/permissionHandler'
import { PluginHandler } from '@handlers/pluginHandler'
import ConditionDetector from '@helpers/conditionDetector'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import SafeProcessModule from '@modules/safe/safeProcess'
import { MemberGovernanceFactory } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { IConditionInterfaceType, IEventLogPermission, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
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
    it('keeps the Safe installed and records a revoke from another contract', async () => {
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
