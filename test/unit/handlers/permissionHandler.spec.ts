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
import Utils from '@helpers/utils'

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

    it('should handle grant with condition address', async () => {
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
      const installPluginWithPermissionGrant = sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.stub(PluginHandler, 'updateConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.calledOnce).to.be.true
      expect(updateConditionAddress.args[0][0]).to.equal('who')
      expect(updateConditionAddress.args[0][1]).to.equal('where')
      expect(updateConditionAddress.args[0][2]).to.equal(NetworksEnum.ethereumSepolia)
      expect(updateConditionAddress.args[0][3]).to.equal(conditionAddress)
      expect(loggerVerbose.calledOnce).to.be.true
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
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const installPluginWithPermissionGrant = sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.stub(PluginHandler, 'updateConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.called).to.be.false
      expect(loggerVerbose.calledOnce).to.be.true
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
        address: '0xaddress',
        network: NetworksEnum.ethereumSepolia,
        transactionHash: 'transactionHash',
        transactionIndex: 212,
        logIndex: 213,
        blockNumber: 1212,
      } as any

      const loggerVerbose = sandbox.stub(logger, 'verbose')
      const findExistingLog = sandbox.stub(Models.DaoPermission, 'findExistingLog').returns(null)
      const installPluginWithPermissionGrant = sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')
      const updateConditionAddress = sandbox.stub(PluginHandler, 'updateConditionAddress')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(findExistingLog.called).to.be.true
      expect(installPluginWithPermissionGrant.calledOnce).to.be.true
      expect(updateConditionAddress.called).to.be.false
      expect(loggerVerbose.calledOnce).to.be.true
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
      const installPluginWithPermissionGrant = sandbox.stub(PluginHandler, 'installPluginOnPermissionGranted')

      await PermissionHandler.handleGrantOnDao(parsedEvent, info)

      expect(verboseStub.calledOnce).to.be.true
      expect(findExistingLog.called).to.be.true
      expect(handleForAdminPlugin.calledOnce).to.be.false
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
