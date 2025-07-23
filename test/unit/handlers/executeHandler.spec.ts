import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ExecuteHandler } from '@handlers/executeHandler'
import { Models } from '@dbModels'
import { NetworksEnum, IPluginStatus } from '@types'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import { ContractInfo } from '@services/aragon-dao/contractInfo'

describe.only('ExecuteHandler', () => {
  let sandbox: SinonSandbox
  let mockPlugin: any
  let mockInfo: any
  let getBlockTimestamp: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Create a real mock plugin in the test database
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

    // Mock info object that will be passed to all handlers
    mockInfo = {
      address: '0x2222222222222222222222222222222222222222', // condition address
      network: NetworksEnum.ethereumMainnet,
      transactionHash: '0xabcdef123456789',
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 12346,
    }

    getBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp')
  })

  afterEach(async () => {
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

      const mockDecodedAction = {
        functionName: 'transfer',
        contractName: 'ERC20Token',
        proxyName: 'ProxyContract',
        implementationAddress: '0x4444444444444444444444444444444444444444',
        inputs: [
          { name: 'to', type: 'address', value: '0x5555', notice: 'Recipient' },
          { name: 'amount', type: 'uint256', value: '1000', notice: 'Amount' },
        ],
        notice: 'Transfers tokens',
      }

      sandbox.stub(ContractInfo, 'parseSignature').resolves(mockDecodedAction)
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const result = await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(result).to.exist
      expect(result.selector).to.equal('0x12345678')
      expect(result.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(result.pluginAddress).to.equal(mockPlugin.address)
      expect(result.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(result.conditionAddress).to.equal(mockInfo.address)
      expect(result.isAllowed).to.be.true

      // Compare the decoded object as plain object
      const decodedObj = result.decoded.toObject ? result.decoded.toObject() : result.decoded
      expect(decodedObj.functionName).to.equal(mockDecodedAction.functionName)
      expect(decodedObj.contractName).to.equal(mockDecodedAction.contractName)
      expect(decodedObj.proxyName).to.equal(mockDecodedAction.proxyName)
      expect(decodedObj.implementationAddress).to.equal(mockDecodedAction.implementationAddress)
      expect(decodedObj.inputs).to.deep.equal(mockDecodedAction.inputs)
      expect(decodedObj.notice).to.equal(mockDecodedAction.notice)

      expect(loggerInfoStub.calledOnce).to.be.true

      // Verify it was actually saved in the database
      const savedPermission = await Models.SelectorPermission.findOne({
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        conditionAddress: mockInfo.address,
      })
      expect(savedPermission).to.exist
    })

    it('should return undefined if plugin not found', async () => {
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

      const result = await ExecuteHandler.selectorAllowed(parsedEvent, infoWithInvalidCondition)

      expect(result).to.be.undefined

      // Verify nothing was created in the database
      const permissions = await Models.SelectorPermission.find({
        conditionAddress: infoWithInvalidCondition.address,
      })
      expect(permissions).to.have.lengthOf(0)
    })

    it('should return undefined if existing selector permission found', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create an existing permission first
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
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        isAllowed: true,
      })

      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'transfer',
        contractName: 'ERC20Token',
      })

      const result = await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(result).to.be.undefined

      // Verify only one permission exists
      const permissions = await Models.SelectorPermission.find({
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        conditionAddress: mockInfo.address,
      })
      expect(permissions).to.have.lengthOf(1)
    })

    it('should handle parseSignature errors gracefully', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      sandbox.stub(ContractInfo, 'parseSignature').rejects(new Error('Parse error'))
      const errorStub = sandbox.stub(logger, 'error')

      const result = await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(result).to.be.undefined
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error processing SelectorAllowed event:')

      // Verify nothing was created in the database
      const permissions = await Models.SelectorPermission.find({
        conditionAddress: mockInfo.address,
      })
      expect(permissions).to.have.lengthOf(0)
    })

    it('should handle getBlockTimestamp errors gracefully', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      getBlockTimestamp.rejects(new Error('Web3 error'))
      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'test',
        contractName: 'TestContract',
      })
      const errorStub = sandbox.stub(logger, 'error')

      const result = await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo)

      expect(result).to.be.undefined
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

      // Create an existing allowed permission
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
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        isAllowed: true,
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')
      getBlockTimestamp.resolves(1620000001)

      await ExecuteHandler.selectorDisallowed(parsedEvent, mockInfo)

      // Verify the permission was updated
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

    it('should warn and return if plugin not found', async () => {
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

      await ExecuteHandler.selectorDisallowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Plugin not found for condition address')
    })

    it('should warn and return if selector permission not found', async () => {
      const parsedEvent = {
        args: {
          selector: '0x87654321', // Different selector
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await ExecuteHandler.selectorDisallowed(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Selector not found for disallowing')
    })

    it('should handle errors gracefully', async () => {
      const errorStub = sandbox.stub(logger, 'error')

      await ExecuteHandler.selectorDisallowed(undefined as any, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error processing SelectorDisallowed event')
    })
  })

  describe('nativeTransfersAllowed', () => {
    it('should create native transfer permission with null selector', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const mockDecoded = {
        functionName: 'NativeTransfer',
        contractName: 'TestContract',
      }

      sandbox.stub(ContractInfo, 'parseSignature').resolves(mockDecoded)
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const result = await ExecuteHandler.nativeTransfersAllowed(parsedEvent, mockInfo)

      expect(result).to.exist
      expect(result.selector).to.be.null
      expect(result.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(result.pluginAddress).to.equal(mockPlugin.address)
      expect(result.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(result.conditionAddress).to.equal(mockInfo.address)
      expect(result.isAllowed).to.be.true

      // Compare the decoded object as plain object
      const decodedObj = result.decoded.toObject ? result.decoded.toObject() : result.decoded
      expect(decodedObj.functionName).to.equal(mockDecoded.functionName)
      expect(decodedObj.contractName).to.equal(mockDecoded.contractName)

      expect(loggerInfoStub.calledOnce).to.be.true

      // Verify it was actually saved in the database
      const savedPermission = await Models.SelectorPermission.findOne({
        selector: null,
        target: '0x3333333333333333333333333333333333333333',
        conditionAddress: mockInfo.address,
      })
      expect(savedPermission).to.exist
    })

    it('should warn and return if plugin not found', async () => {
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

      await ExecuteHandler.nativeTransfersAllowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Plugin not found for condition address')
    })

    it('should return if existing permission found', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create an existing native transfer permission
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
        target: '0x3333333333333333333333333333333333333333',
        isAllowed: true,
      })

      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'NativeTransfer',
        contractName: 'TestContract',
      })

      const result = await ExecuteHandler.nativeTransfersAllowed(parsedEvent, mockInfo)

      expect(result).to.be.undefined

      // Verify only one permission exists
      const permissions = await Models.SelectorPermission.find({
        selector: null,
        target: '0x3333333333333333333333333333333333333333',
        conditionAddress: mockInfo.address,
      })
      expect(permissions).to.have.lengthOf(1)
    })

    it('should handle parseSignature errors gracefully', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      sandbox.stub(ContractInfo, 'parseSignature').rejects(new Error('Parse error'))
      const errorStub = sandbox.stub(logger, 'error')

      await ExecuteHandler.nativeTransfersAllowed(parsedEvent, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error processing NativeTransfersAllowed event')
    })

    it('should pass correct parameters to parseSignature', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const parseSignatureStub = sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'NativeTransfer',
        contractName: 'TestContract',
      })

      await ExecuteHandler.nativeTransfersAllowed(parsedEvent, mockInfo)

      expect(parseSignatureStub.calledOnce).to.be.true
      expect(parseSignatureStub.calledWith(null, '0x3333333333333333333333333333333333333333', mockInfo.network)).to.be
        .true
    })
  })

  describe('nativeTransfersDisallowed', () => {
    it('should update existing native transfer permission to disallowed', async () => {
      const parsedEvent = {
        args: {
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      // Create an existing allowed native transfer permission
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
        target: '0x3333333333333333333333333333333333333333',
        isAllowed: true,
      })

      const loggerInfoStub = sandbox.stub(logger, 'info')
      getBlockTimestamp.resolves(1620000001)

      await ExecuteHandler.nativeTransfersDisallowed(parsedEvent, mockInfo)

      // Verify the permission was updated
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

    it('should warn and return if plugin not found', async () => {
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

      await ExecuteHandler.nativeTransfersDisallowed(parsedEvent, infoWithInvalidCondition)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('Plugin not found for condition address')
    })

    it('should warn and return if native transfer permission not found', async () => {
      const parsedEvent = {
        args: {
          where: '0x4444444444444444444444444444444444444444', // Different target
        },
      } as any

      const warnStub = sandbox.stub(logger, 'warn')

      await ExecuteHandler.nativeTransfersDisallowed(parsedEvent, mockInfo)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.args[0][0]).to.equal('ETH transfer permission not found for disallowing')
    })

    it('should handle errors gracefully', async () => {
      const errorStub = sandbox.stub(logger, 'error')

      await ExecuteHandler.nativeTransfersDisallowed(undefined as any, mockInfo)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error processing NativeTransfersDisallowed event')
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete lifecycle: allow then disallow selector', async () => {
      const selector = '0xaabbccdd'
      const target = '0x5555555555555555555555555555555555555555'

      // Step 1: Allow selector
      const allowEvent = {
        args: { selector, where: target },
      } as any

      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'approve',
        contractName: 'Token',
        proxyName: 'TokenProxy',
        implementationAddress: '0x7777',
        inputs: [],
        notice: 'Approves tokens',
      })

      const allowResult = await ExecuteHandler.selectorAllowed(allowEvent, mockInfo)
      expect(allowResult).to.exist
      expect(allowResult.isAllowed).to.be.true

      // Step 2: Disallow selector
      const disallowEvent = {
        args: { selector, where: target },
      } as any

      await ExecuteHandler.selectorDisallowed(disallowEvent, mockInfo)

      // Verify the permission was updated
      const updatedPermission = await Models.SelectorPermission.findOne({
        selector,
        target,
        conditionAddress: mockInfo.address,
      })

      expect(updatedPermission).to.exist
      expect(updatedPermission.isAllowed).to.be.false
      expect(updatedPermission.disallowed.status).to.be.true
    })

    it('should handle complete lifecycle: allow then disallow native transfers', async () => {
      const target = '0x6666666666666666666666666666666666666666'

      // Step 1: Allow native transfers
      const allowEvent = {
        args: { where: target },
      } as any

      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'NativeTransfer',
        contractName: 'Contract',
      })

      const allowResult = await ExecuteHandler.nativeTransfersAllowed(allowEvent, mockInfo)
      expect(allowResult).to.exist
      expect(allowResult.isAllowed).to.be.true
      expect(allowResult.selector).to.be.null

      // Step 2: Disallow native transfers
      const disallowEvent = {
        args: { where: target },
      } as any

      await ExecuteHandler.nativeTransfersDisallowed(disallowEvent, mockInfo)

      // Verify the permission was updated
      const updatedPermission = await Models.SelectorPermission.findOne({
        selector: null,
        target,
        conditionAddress: mockInfo.address,
      })

      expect(updatedPermission).to.exist
      expect(updatedPermission.isAllowed).to.be.false
      expect(updatedPermission.disallowed.status).to.be.true
    })

    it('should handle multiple permissions for different selectors', async () => {
      const target = '0x7777777777777777777777777777777777777777'

      // Create multiple permissions
      const selectors = ['0x11111111', '0x22222222', '0x33333333']

      sandbox.stub(ContractInfo, 'parseSignature').resolves({
        functionName: 'function',
        contractName: 'Contract',
      })

      for (const selector of selectors) {
        const event = {
          args: { selector, where: target },
        } as any

        const result = await ExecuteHandler.selectorAllowed(event, {
          ...mockInfo,
          logIndex: mockInfo.logIndex + parseInt(selector.slice(2, 4), 16), // Unique logIndex
        })
        expect(result).to.exist
      }

      // Verify all were created
      const permissions = await Models.SelectorPermission.find({
        target,
        conditionAddress: mockInfo.address,
      })
      expect(permissions).to.have.lengthOf(3)
      expect(permissions.every(p => p.isAllowed)).to.be.true
    })
  })
})
