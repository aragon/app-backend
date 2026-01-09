import { Models } from '@dbModels'
import { PermissionHandler } from '@handlers/permissionHandler'
import { PluginHandler } from '@handlers/pluginHandler'
import Utils from '@helpers/utils'
import logger from '@logger'
import { MemberGovernanceFactory } from '@src/governance'
import { IPermission } from '@src/types/permission'
import { NetworksEnum } from '@types'
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
    const parentDaoAddress = '0x1111111111111111111111111111111111111111'
    const childDaoAddress = '0x2222222222222222222222222222222222222222'

    it('should link DAOs when parent triggers and child permission already exists', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
        update: sandbox.stub().resolves(),
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: [],
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves({ id: 'existing' } as any)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.calledOnce).to.be.true
      expect(linkDaosStub.calledWith(mockParentDao, mockChildDao, network)).to.be.true
    })

    it('should link DAOs when child triggers and parent permission already exists', async () => {
      const subToParentPermissionId = ethers.id(IPermission.SUB_DAO_TO_PARENT_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
        update: sandbox.stub().resolves(),
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: [],
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves({ id: 'existing' } as any)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()

      await PermissionHandler.handleDaoLinkingOnGrant(
        childDaoAddress,
        parentDaoAddress,
        subToParentPermissionId,
        network,
      )

      expect(linkDaosStub.calledOnce).to.be.true
      expect(linkDaosStub.calledWith(mockParentDao, mockChildDao, network)).to.be.true
    })

    it('should not link when counterpart permission does not exist', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      sandbox.stub(Models.DaoPermission, 'findActiveAcknowledgementPermission').resolves(null)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when parent DAO is already a child', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: '0x3333333333333333333333333333333333333333',
        subDaos: [],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when child DAO already has sub-DAOs (is a parent)', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: ['0x4444444444444444444444444444444444444444'],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should reject linking when child DAO already has a different parent', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: '0x5555555555555555555555555555555555555555',
        subDaos: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'warn')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })

    it('should skip linking when one or both DAOs do not exist', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const linkDaosStub = sandbox.stub(PermissionHandler, 'linkDaos').resolves()
      sandbox.stub(logger, 'verbose')

      await PermissionHandler.handleDaoLinkingOnGrant(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(linkDaosStub.called).to.be.false
    })
  })

  describe('handleDaoUnlinkingOnRevoke', () => {
    const network = NetworksEnum.ethereumSepolia
    const parentDaoAddress = '0x1111111111111111111111111111111111111111'
    const childDaoAddress = '0x2222222222222222222222222222222222222222'

    it('should unlink DAOs when permission is revoked', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [childDaoAddress],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: parentDaoAddress,
        subDaos: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(unlinkDaosStub.calledOnce).to.be.true
      expect(unlinkDaosStub.calledWith(mockParentDao, mockChildDao, network)).to.be.true
    })

    it('should not unlink if link does not exist', async () => {
      const parentToSubPermissionId = ethers.id(IPermission.PARENT_TO_SUB_DAO_ACKNOWLEDGEMENT_PERMISSION_ID)

      const mockParentDao = {
        address: parentDaoAddress,
        parentDao: null,
        subDaos: [],
      }
      const mockChildDao = {
        address: childDaoAddress,
        parentDao: null,
        subDaos: [],
      }

      sandbox.stub(Models.Dao, 'findByAddress').callsFake(addr => {
        if (addr === parentDaoAddress) return Promise.resolve(mockParentDao)
        if (addr === childDaoAddress) return Promise.resolve(mockChildDao)
        return Promise.resolve(null)
      })

      const unlinkDaosStub = sandbox.stub(PermissionHandler, 'unlinkDaos').resolves()

      await PermissionHandler.handleDaoUnlinkingOnRevoke(
        parentDaoAddress,
        childDaoAddress,
        parentToSubPermissionId,
        network,
      )

      expect(unlinkDaosStub.called).to.be.false
    })
  })
})
