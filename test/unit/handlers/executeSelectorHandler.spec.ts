import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { SelectorPermissionHandler } from '@handlers/executeSelectorHandler'
import { Models } from '@dbModels'
import { NetworksEnum, IPluginStatus } from '@types'
import logger from '@logger'
import Web3Helper from '@helpers/web3'

describe('Indexer: ExecuteSelectorHandler', () => {
  let sandbox: SinonSandbox
  let mockPlugin: any
  let mockInfo: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    mockPlugin = await Models.Plugin.create({
      status: IPluginStatus.installed,
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 12345,
      blockTimestamp: 1620000000,
      transactionHash: '0x123abc',
      address: '0x1234567890123456789012345678901234567890',
      daoAddress: '0x9876543210987654321098765432109876543210',
      pluginSetupRepoAddress: '0x1111111111111111111111111111111111111111',
      interfaceType: 'admin',
      conditionAddress: '0x2222222222222222222222222222222222222222',
    })

    mockInfo = {
      address: '0x2222222222222222222222222222222222222222', // condition address
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0xabcdef123456789',
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 12346,
    }

    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000001)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('selectorAllowed', () => {
    it('should create selector permission when allowed', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const loggerInfoStub = sandbox.stub(logger, 'info')
      const findExistingLogStub = sandbox.stub(Models.SelectorPermission, 'findExistingLog').resolves(null)
      const createStub = sandbox.stub(Models.SelectorPermission, 'create').resolves({
        id: 'selector-permission-id',
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        conditionAddress: mockInfo.address,
        isAllowed: true,
      } as any)

      await SelectorPermissionHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(
        findExistingLogStub.calledWith({
          network: NetworksEnum.ethereumMainnet,
          transactionHash: mockInfo.transactionHash,
          transactionIndex: mockInfo.transactionIndex,
          logIndex: mockInfo.logIndex,
          conditionAddress: mockInfo.address,
        }),
      ).to.be.true

      expect(createStub.calledOnce).to.be.true
      const createArgs = createStub.args[0][0]
      expect(createArgs.selector).to.equal('0x12345678')
      expect(createArgs.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(createArgs.pluginAddress).to.equal(mockPlugin.address)
      expect(createArgs.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(createArgs.conditionAddress).to.equal(mockInfo.address)
      expect(createArgs.isAllowed).to.be.true

      expect(loggerInfoStub.calledOnce).to.be.true
    })

    it('should not create selector permission if plugin not found', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const infoWithInvalidCondition = {
        ...mockInfo,
        address: '0x9999999999999999999999999999999999999999',
      }

      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const findExistingLogStub = sandbox.stub(Models.SelectorPermission, 'findExistingLog')
      const createStub = sandbox.stub(Models.SelectorPermission, 'create')

      await SelectorPermissionHandler.selectorAllowed(parsedEvent, infoWithInvalidCondition)

      expect(findOneStub.calledOnce).to.be.true
      expect(
        findOneStub.calledWith({
          conditionAddress: infoWithInvalidCondition.address,
          network: infoWithInvalidCondition.network,
          status: IPluginStatus.installed,
        }),
      ).to.be.true

      expect(findExistingLogStub.notCalled).to.be.true
      expect(createStub.notCalled).to.be.true
    })

    it('should not create duplicate selector permission', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const existingPermissionStub = sandbox.stub(Models.SelectorPermission, 'findExistingLog').resolves({
        id: 'existing-permission-id',
      } as any)
      const createStub = sandbox.stub(Models.SelectorPermission, 'create')

      await SelectorPermissionHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(existingPermissionStub.calledOnce).to.be.true
      expect(
        existingPermissionStub.calledWith({
          network: NetworksEnum.ethereumMainnet,
          transactionHash: mockInfo.transactionHash,
          transactionIndex: mockInfo.transactionIndex,
          logIndex: mockInfo.logIndex,
          conditionAddress: mockInfo.address,
        }),
      ).to.be.true

      expect(createStub.notCalled).to.be.true
    })

    it('should handle errors gracefully', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Database error'))

      await SelectorPermissionHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('selectorDisallowed', () => {
    it('should update existing selector permission to disallowed', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create existing allowed selector permission
      const existingPermission = await Models.SelectorPermission.create({
        network: mockInfo.network,
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 12340,
        blockTimestamp: 1620000000,
        conditionAddress: mockInfo.address,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        selector: parsedEvent.args.selector,
        target: parsedEvent.args.where,
        isAllowed: true,
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await SelectorPermissionHandler.selectorDisallowed(parsedEvent, mockInfo)

      const updatedPermission = await Models.SelectorPermission.findOne({
        id: existingPermission.id,
      })

      expect(updatedPermission).to.exist
      expect(updatedPermission.isAllowed).to.be.false
      expect(updatedPermission.disallowed.status).to.be.true
      expect(updatedPermission.disallowed.transactionHash).to.equal(mockInfo.transactionHash)
      expect(updatedPermission.disallowed.blockNumber).to.equal(mockInfo.blockNumber)
      expect(updatedPermission.disallowed.blockTimestamp).to.equal(1620000001)
      expect(loggerInfoStub.calledOnce).to.be.true
    })

    it('should warn if plugin not found', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const infoWithInvalidCondition = {
        ...mockInfo,
        address: '0x9999999999999999999999999999999999999999',
      }

      const warnStub = sandbox.stub(logger, 'warn')

      await SelectorPermissionHandler.selectorDisallowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('Plugin not found for condition address' as any)).to.be.true
    })

    it('should warn if selector permission not found for disallowing', async () => {
      const parsedEvent = {
        args: {
          selector: '0x87654321', // Different selector
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await SelectorPermissionHandler.selectorDisallowed(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('Selector not found for disallowing' as any)).to.be.true
    })

    it('should handle errors gracefully', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Database error'))

      await SelectorPermissionHandler.selectorDisallowed(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('ethTransfersAllowed', () => {
    it('should create ETH transfer permission with null selector', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await SelectorPermissionHandler.ethTransfersAllowed(parsedEvent, mockInfo)

      const ethPermission = await Models.SelectorPermission.findOne({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: mockInfo.transactionHash,
        conditionAddress: mockInfo.address,
        selector: null,
      })

      expect(ethPermission).to.exist
      expect(ethPermission.selector).to.be.null
      expect(ethPermission.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(ethPermission.pluginAddress).to.equal(mockPlugin.address)
      expect(ethPermission.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(ethPermission.conditionAddress).to.equal(mockInfo.address)
      expect(ethPermission.isAllowed).to.be.true
      expect(loggerInfoStub.calledOnce).to.be.true
    })

    it('should warn if plugin not found', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const infoWithInvalidCondition = {
        ...mockInfo,
        address: '0x9999999999999999999999999999999999999999',
      }

      const warnStub = sandbox.stub(logger, 'warn')

      await SelectorPermissionHandler.ethTransfersAllowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('Plugin not found for condition address' as any)).to.be.true
    })

    it('should not create duplicate ETH transfer permission', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create existing ETH transfer permission
      await Models.SelectorPermission.create({
        network: mockInfo.network,
        transactionHash: mockInfo.transactionHash,
        transactionIndex: mockInfo.transactionIndex,
        logIndex: mockInfo.logIndex,
        blockNumber: mockInfo.blockNumber,
        blockTimestamp: 1620000001,
        conditionAddress: mockInfo.address,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        selector: null,
        target: parsedEvent.args.where,
        isAllowed: true,
      })

      await SelectorPermissionHandler.ethTransfersAllowed(parsedEvent, mockInfo)

      const ethPermissions = await Models.SelectorPermission.find({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: mockInfo.transactionHash,
        conditionAddress: mockInfo.address,
        selector: null,
      })

      expect(ethPermissions).to.have.lengthOf(1)
    })

    it('should handle errors gracefully', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Database error'))

      await SelectorPermissionHandler.ethTransfersAllowed(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('ethTransfersDisallowed', () => {
    it('should update existing ETH transfer permission to disallowed', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create existing allowed ETH transfer permission
      const existingPermission = await Models.SelectorPermission.create({
        network: mockInfo.network,
        transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        transactionIndex: 0,
        logIndex: 0,
        blockNumber: 12340,
        blockTimestamp: 1620000000,
        conditionAddress: mockInfo.address,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        selector: null,
        target: parsedEvent.args.where,
        isAllowed: true,
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')

      await SelectorPermissionHandler.ethTransfersDisallowed(parsedEvent, mockInfo)

      const updatedPermission = await Models.SelectorPermission.findOne({
        id: existingPermission.id,
      })

      expect(updatedPermission).to.exist
      expect(updatedPermission.isAllowed).to.be.false
      expect(updatedPermission.disallowed.status).to.be.true
      expect(updatedPermission.disallowed.transactionHash).to.equal(mockInfo.transactionHash)
      expect(updatedPermission.disallowed.blockNumber).to.equal(mockInfo.blockNumber)
      expect(updatedPermission.disallowed.blockTimestamp).to.equal(1620000001)
      expect(loggerInfoStub.calledOnce).to.be.true
    })

    it('should warn if plugin not found', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const infoWithInvalidCondition = {
        ...mockInfo,
        address: '0x9999999999999999999999999999999999999999',
      }

      const warnStub = sandbox.stub(logger, 'warn')

      await SelectorPermissionHandler.ethTransfersDisallowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('Plugin not found for condition address' as any)).to.be.true
    })

    it('should warn if ETH transfer permission not found for disallowing', async () => {
      const parsedEvent = {
        args: {
          where: '0x4444444444444444444444444444444444444444', // Different target
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await SelectorPermissionHandler.ethTransfersDisallowed(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWith('ETH transfer permission not found for disallowing' as any)).to.be.true
    })

    it('should handle errors gracefully', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Database error'))

      await SelectorPermissionHandler.ethTransfersDisallowed(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('Integration scenarios', () => {
    beforeEach(async () => {
      sandbox.stub(logger, 'info')
    })
    afterEach(async () => {
      sandbox.restore()
    })

    it('should handle selector allowed followed by disallowed', async () => {
      const selectorAllowedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const selectorDisallowedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Allow selector
      await SelectorPermissionHandler.selectorAllowed(selectorAllowedEvent, mockInfo)

      let permission = await Models.SelectorPermission.findOne({
        network: NetworksEnum.ethereumMainnet,
        conditionAddress: mockInfo.address,
        selector: '0x12345678',
      })

      expect(permission).to.exist
      expect(permission.isAllowed).to.be.true

      // Disallow selector
      const disallowInfo = {
        ...mockInfo,
        transactionHash: '0xdef456789',
        blockNumber: 12347,
      }

      await SelectorPermissionHandler.selectorDisallowed(selectorDisallowedEvent, disallowInfo)

      permission = await Models.SelectorPermission.findOne({
        id: permission.id,
      })

      expect(permission.isAllowed).to.be.false
      expect(permission.disallowed.status).to.be.true
      expect(permission.disallowed.transactionHash).to.equal(disallowInfo.transactionHash)
    })

    it('should handle ETH transfers allowed followed by disallowed', async () => {
      const ethAllowedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const ethDisallowedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Allow ETH transfers
      await SelectorPermissionHandler.ethTransfersAllowed(ethAllowedEvent, mockInfo)

      let permission = await Models.SelectorPermission.findOne({
        network: NetworksEnum.ethereumMainnet,
        conditionAddress: mockInfo.address,
        selector: null,
      })

      expect(permission).to.exist
      expect(permission.isAllowed).to.be.true
      expect(permission.selector).to.be.null

      // Disallow ETH transfers
      const disallowInfo = {
        ...mockInfo,
        transactionHash: '0xdef456789',
        blockNumber: 12347,
      }

      await SelectorPermissionHandler.ethTransfersDisallowed(ethDisallowedEvent, disallowInfo)

      permission = await Models.SelectorPermission.findOne({
        id: permission.id,
      })

      expect(permission.isAllowed).to.be.false
      expect(permission.disallowed.status).to.be.true
      expect(permission.disallowed.transactionHash).to.equal(disallowInfo.transactionHash)
    })

    it('should handle mixed selector and ETH transfer permissions', async () => {
      const selectorEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const ethEvent = {
        args: {
          where: '0x4444444444444444444444444444444444444444',
        },
      } as any

      // Create both types of permissions
      await SelectorPermissionHandler.selectorAllowed(selectorEvent, mockInfo)

      const ethInfo = {
        ...mockInfo,
        transactionHash: '0xdef456789',
        logIndex: 1,
      }

      await SelectorPermissionHandler.ethTransfersAllowed(ethEvent, ethInfo)

      const permissions = await Models.SelectorPermission.find({
        network: NetworksEnum.ethereumMainnet,
        conditionAddress: mockInfo.address,
      })

      expect(permissions).to.have.lengthOf(2)

      const selectorPermission = permissions.find(p => p.selector === '0x12345678')
      const ethPermission = permissions.find(p => p.selector === null)

      expect(selectorPermission).to.exist
      expect(selectorPermission.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(selectorPermission.isAllowed).to.be.true

      expect(ethPermission).to.exist
      expect(ethPermission.target).to.equal('0x4444444444444444444444444444444444444444')
      expect(ethPermission.isAllowed).to.be.true
    })
  })
})
