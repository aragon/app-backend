import { expect } from 'chai'
import * as sinon from 'sinon'
import logger from '@logger'
import { SinonSandbox } from 'sinon'
import { PermissionHandler } from '@handlers/permissionHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { ethers } from 'ethers'
import { ProxyMember } from '@modules/proxyMember'
import { PluginHandler } from '@handlers/pluginHandler'

describe('Indexer: Permission Handler', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => {
    sandbox.restore()
  })

  describe('handleGrantOnDao', () => {
    it('should handle grant on dao', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
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

      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(findExistingLog.callCount).to.eq(1)
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle grant on dao and the admin member as well', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PROPOSAL_PERMISSION'),
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

      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(findExistingLog.called).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should return if already exists', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
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

      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(findExistingLog.callCount).to.eq(1)
      expect(loggerVerbose.notCalled).to.be.true
    })

    it('should throw error', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: '0xf281525e53675515a6ba7cc7bea8a81e649b3608423ee2d73be1752cea887889',
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

      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(loggerError.calledOnce).to.be.true
    })

    it('should handle when execute permission is revoked', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
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
      const installPluginWithPermissionGrant = sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(verboseStub.calledOnce).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(installPluginWithPermissionGrant.args[0][0]).to.be.eq('where')
      expect(installPluginWithPermissionGrant.args[0][1]).to.be.eq('who')
      expect(installPluginWithPermissionGrant.args[0][2]).to.be.deep.eq(info)
    })
  })

  describe('handleRevokeOnDao', () => {
    it('should handle revoke on dao', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
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

      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(findExistingLog.called).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle revoke on dao and the admin member as well', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PROPOSAL_PERMISSION'),
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

      expect(handleForAdminPlugin.calledOnce).to.be.true
      expect(findExistingLog.called).to.be.true
      expect(loggerVerbose.calledOnce).to.be.true
    })

    it('should handle when execute permission is revoked', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: ethers.id('EXECUTE_PERMISSION'),
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
      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(findExistingLog.called).to.be.true
      expect(uninstallPluginWithPermissionRevoke.calledOnce).to.be.true
      expect(uninstallPluginWithPermissionRevoke.args[0][0]).to.be.eq('who')
      expect(uninstallPluginWithPermissionRevoke.args[0][1]).to.be.eq('where')
    })

    it('should return if already exists', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
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

      expect(handleForAdminPlugin.calledOnce).to.be.false
      expect(findExistingLog.called).to.be.true
      expect(loggerVerbose.notCalled).to.be.true
    })

    it('should throw error', async () => {
      const parsedEvent = {
        args: {
          where: 'where',
          who: 'who',
          permissionId: 'permissionId',
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
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
      const addToDaoStub = sandbox.stub(ProxyMember, 'addToDao')
      const loggerInfo = sandbox.stub(logger, 'info')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(addToDaoStub.calledOnce).to.be.true
      expect(sendMessage.calledOnce).to.be.true
      expect(loggerInfo.calledOnce).to.be.true
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
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
      const removeFromDaoStub = sandbox.stub(ProxyMember, 'removeFromDao')
      const loggerInfo = sandbox.stub(logger, 'info')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(removeFromDaoStub.calledOnce).to.be.true
      expect(sendMessage.calledOnce).to.be.true
      expect(loggerInfo.calledOnce).to.be.true
    })

    it('should return if not exists', async () => {
      const daoAddress = '0xaddress'
      const pluginAddress = '0xpluginAddress'
      const network = NetworksEnum.ethereumSepolia
      const where = 'where'
      const add = true

      const findExistingLog = sandbox.stub(Models.Plugin, 'findOne').returns(null)
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
      const loggerInfo = sandbox.stub(logger, 'info')

      await PermissionHandler.handleForAdminPlugin(daoAddress, pluginAddress, network, where, add)

      expect(findExistingLog.calledOnce).to.be.true
      expect(sendMessage.notCalled).to.be.true
      expect(loggerInfo.notCalled).to.be.true
    })
  })
})
