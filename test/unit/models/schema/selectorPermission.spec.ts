import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Model: SelectorPermission', () => {
  let sandbox: SinonSandbox
  let rawSelectorPermission: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    rawSelectorPermission = {
      network: NetworksEnum.ethereumSepolia,
      transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
      transactionIndex: 0,
      logIndex: 0,
      blockNumber: 12345,
      blockTimestamp: 1234567890,
      pluginAddress: '0x1111111111111111111111111111111111111111',
      daoAddress: '0x2222222222222222222222222222222222222222',
      conditionAddress: '0x3333333333333333333333333333333333333333',
      selector: '0x12345678',
      target: '0x4444444444444444444444444444444444444444',
      isAllowed: true,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('should create a new selector permission', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      expect(selectorPermission.network).to.equal(rawSelectorPermission.network)
      expect(selectorPermission.transactionHash).to.equal(rawSelectorPermission.transactionHash)
      expect(selectorPermission.transactionIndex).to.equal(rawSelectorPermission.transactionIndex)
      expect(selectorPermission.logIndex).to.equal(rawSelectorPermission.logIndex)
      expect(selectorPermission.blockNumber).to.equal(rawSelectorPermission.blockNumber)
      expect(selectorPermission.blockTimestamp).to.equal(rawSelectorPermission.blockTimestamp)
      expect(selectorPermission.pluginAddress).to.equal(rawSelectorPermission.pluginAddress)
      expect(selectorPermission.daoAddress).to.equal(rawSelectorPermission.daoAddress)
      expect(selectorPermission.conditionAddress).to.equal(rawSelectorPermission.conditionAddress)
      expect(selectorPermission.selector).to.equal(rawSelectorPermission.selector)
      expect(selectorPermission.target).to.equal(rawSelectorPermission.target)
      expect(selectorPermission.isAllowed).to.equal(rawSelectorPermission.isAllowed)
      expect(selectorPermission.disallowed.status).to.be.false
    })

    it('should create selector permission with null selector for ETH transfers', async () => {
      const ethTransferPermission = {
        ...rawSelectorPermission,
        selector: null,
      }

      const selectorPermission = await Models.SelectorPermission.create(ethTransferPermission)

      expect(selectorPermission.selector).to.be.null
      expect(selectorPermission.target).to.equal(ethTransferPermission.target)
      expect(selectorPermission.isAllowed).to.be.true
    })

    it('should not create a new selector permission if network is missing', async () => {
      await expect(
        Models.SelectorPermission.create({
          ...rawSelectorPermission,
          network: undefined,
        }),
      ).to.be.rejectedWith('network is required')
    })

    it('should not create a new selector permission if transactionHash is missing', async () => {
      await expect(
        Models.SelectorPermission.create({
          ...rawSelectorPermission,
          transactionHash: undefined,
        }),
      ).to.be.rejectedWith('transactionHash is required')
    })

    it('should not create a new selector permission if transactionIndex is missing', async () => {
      await expect(
        Models.SelectorPermission.create({
          ...rawSelectorPermission,
          transactionIndex: undefined,
        }),
      ).to.be.rejectedWith('transactionIndex is required')
    })

    it('should not create a new selector permission if logIndex is missing', async () => {
      await expect(
        Models.SelectorPermission.create({
          ...rawSelectorPermission,
          logIndex: undefined,
        }),
      ).to.be.rejectedWith('logIndex is required')
    })

    it('should not create a new selector permission if conditionAddress is missing', async () => {
      await expect(
        Models.SelectorPermission.create({
          ...rawSelectorPermission,
          conditionAddress: undefined,
        }),
      ).to.be.rejectedWith('conditionAddress is required')
    })

    it('should create selector permission with decoded action data', async () => {
      const decodedData = {
        functionName: 'transfer',
        contractName: 'ERC20',
        proxyName: 'TransparentProxy',
        implementationAddress: '0x5555555555555555555555555555555555555555',
        inputs: [
          { name: 'to', type: 'address', value: '0x1234567890123456789012345678901234567890' },
          { name: 'amount', type: 'uint256', value: '1000000000000000000' },
        ],
        notice: 'Transfer tokens to address',
      }

      const selectorPermissionWithDecoded = {
        ...rawSelectorPermission,
        decoded: decodedData,
      }

      const selectorPermission = await Models.SelectorPermission.create(selectorPermissionWithDecoded)

      expect(selectorPermission.decoded).to.be.an('object')
      expect(selectorPermission.decoded.functionName).to.equal(decodedData.functionName)
      expect(selectorPermission.decoded.contractName).to.equal(decodedData.contractName)
      expect(selectorPermission.decoded.proxyName).to.equal(decodedData.proxyName)
      expect(selectorPermission.decoded.implementationAddress).to.equal(decodedData.implementationAddress)
      expect(selectorPermission.decoded.inputs).to.deep.equal(decodedData.inputs)
      expect(selectorPermission.decoded.notice).to.equal(decodedData.notice)
    })

    it('should create selector permission with null decoded by default', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      expect(selectorPermission.decoded).to.be.null
    })

    it('should update decoded field', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      expect(selectorPermission.decoded).to.be.null

      const decodedData = {
        functionName: 'approve',
        contractName: 'ERC20',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          { name: 'spender', type: 'address', value: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
          { name: 'amount', type: 'uint256', value: '999999999999999999' },
        ],
        notice: 'Approve spender to spend tokens',
      }

      const updatedPermission = await selectorPermission.update({
        decoded: decodedData,
      })

      expect(updatedPermission.decoded).to.be.an('object')
      expect(updatedPermission.decoded.functionName).to.equal(decodedData.functionName)
      expect(updatedPermission.decoded.contractName).to.equal(decodedData.contractName)
      expect(updatedPermission.decoded.proxyName).to.be.null
      expect(updatedPermission.decoded.implementationAddress).to.be.null
      expect(updatedPermission.decoded.inputs).to.deep.equal(decodedData.inputs)
      expect(updatedPermission.decoded.notice).to.equal(decodedData.notice)
    })

    it('should handle decoded with minimal data', async () => {
      const minimalDecoded = {
        functionName: 'unknown',
        contractName: null,
        proxyName: null,
        implementationAddress: null,
        inputs: null,
        notice: null,
      }

      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        decoded: minimalDecoded,
      })

      expect(selectorPermission.decoded.functionName).to.equal('unknown')
      expect(selectorPermission.decoded.contractName).to.be.null
      expect(selectorPermission.decoded.proxyName).to.be.null
      expect(selectorPermission.decoded.implementationAddress).to.be.null
      expect(selectorPermission.decoded.inputs).to.be.null
      expect(selectorPermission.decoded.notice).to.be.null
    })

    it('should handle decoded with complex inputs', async () => {
      const complexDecoded = {
        functionName: 'swapExactTokensForTokens',
        contractName: 'UniswapV2Router',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          { name: 'amountIn', type: 'uint256', value: '1000000' },
          { name: 'amountOutMin', type: 'uint256', value: '900000' },
          {
            name: 'path',
            type: 'address[]',
            value: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
          },
          { name: 'to', type: 'address', value: '0x3333333333333333333333333333333333333333' },
          { name: 'deadline', type: 'uint256', value: '1234567890' },
        ],
        notice: 'Swap tokens through Uniswap',
      }

      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        decoded: complexDecoded,
      })

      expect(selectorPermission.decoded.functionName).to.equal(complexDecoded.functionName)
      expect(selectorPermission.decoded.inputs).to.have.lengthOf(5)
      expect(selectorPermission.decoded.inputs[2].type).to.equal('address[]')
      expect(selectorPermission.decoded.inputs[2].value).to.be.an('array').with.lengthOf(2)
    })

    it('should allow transactionIndex to be 0', async () => {
      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        transactionIndex: 0,
      })

      expect(selectorPermission.transactionIndex).to.equal(0)
    })

    it('should allow logIndex to be 0', async () => {
      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        logIndex: 0,
      })

      expect(selectorPermission.logIndex).to.equal(0)
    })
  })

  describe('getEntityId', () => {
    it('should get entity id', async () => {
      const entityId = Models.SelectorPermission.getEntityId({
        network: rawSelectorPermission.network,
        transactionHash: rawSelectorPermission.transactionHash,
        transactionIndex: rawSelectorPermission.transactionIndex,
        logIndex: rawSelectorPermission.logIndex,
        conditionAddress: rawSelectorPermission.conditionAddress,
      })

      expect(entityId).to.equal(
        `${rawSelectorPermission.network}-${rawSelectorPermission.transactionHash}-${rawSelectorPermission.transactionIndex}-${rawSelectorPermission.logIndex}-${rawSelectorPermission.conditionAddress}`,
      )
    })
  })

  describe('findExistingLog', () => {
    it('should find existing log', async () => {
      const createdSelectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      const existingLog = await Models.SelectorPermission.findExistingLog({
        network: rawSelectorPermission.network,
        transactionHash: rawSelectorPermission.transactionHash,
        transactionIndex: rawSelectorPermission.transactionIndex,
        logIndex: rawSelectorPermission.logIndex,
        conditionAddress: rawSelectorPermission.conditionAddress,
      })

      expect(existingLog).to.be.an('object')
      expect(existingLog?.id).to.equal(createdSelectorPermission.id)
      expect(existingLog?.selector).to.equal(rawSelectorPermission.selector)
      expect(existingLog?.target).to.equal(rawSelectorPermission.target)
      expect(existingLog?.isAllowed).to.equal(rawSelectorPermission.isAllowed)
    })

    it('should return null when log does not exist', async () => {
      const existingLog = await Models.SelectorPermission.findExistingLog({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
        transactionIndex: 0,
        logIndex: 0,
        conditionAddress: '0x9999999999999999999999999999999999999999',
      })

      expect(existingLog).to.be.null
    })
  })

  describe('findByEntityId', () => {
    it('should find by entity id', async () => {
      const createdSelectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      const entityId = Models.SelectorPermission.getEntityId({
        network: rawSelectorPermission.network,
        transactionHash: rawSelectorPermission.transactionHash,
        transactionIndex: rawSelectorPermission.transactionIndex,
        logIndex: rawSelectorPermission.logIndex,
        conditionAddress: rawSelectorPermission.conditionAddress,
      })

      const foundSelectorPermission = await Models.SelectorPermission.findByEntityId(entityId)

      expect(foundSelectorPermission).to.be.an('object')
      expect(foundSelectorPermission?.id).to.equal(createdSelectorPermission.id)
      expect(foundSelectorPermission?.selector).to.equal(rawSelectorPermission.selector)
    })
  })

  describe('decoded field', () => {
    it('should create selector permission with decoded action data', async () => {
      const decodedData = {
        functionName: 'transfer',
        contractName: 'ERC20',
        proxyName: 'TransparentProxy',
        implementationAddress: '0x5555555555555555555555555555555555555555',
        inputs: [
          { name: 'to', type: 'address', value: '0x1234567890123456789012345678901234567890' },
          { name: 'amount', type: 'uint256', value: '1000000000000000000' },
        ],
        notice: 'Transfer tokens to address',
      }

      const selectorPermissionWithDecoded = {
        ...rawSelectorPermission,
        decoded: decodedData,
      }

      const selectorPermission = await Models.SelectorPermission.create(selectorPermissionWithDecoded)

      expect(selectorPermission.decoded).to.be.an('object')
      expect(selectorPermission.decoded.functionName).to.equal(decodedData.functionName)
      expect(selectorPermission.decoded.contractName).to.equal(decodedData.contractName)
      expect(selectorPermission.decoded.proxyName).to.equal(decodedData.proxyName)
      expect(selectorPermission.decoded.implementationAddress).to.equal(decodedData.implementationAddress)
      expect(selectorPermission.decoded.inputs).to.deep.equal(decodedData.inputs)
      expect(selectorPermission.decoded.notice).to.equal(decodedData.notice)
    })

    it('should create selector permission with null decoded by default', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      expect(selectorPermission.decoded).to.be.null
    })

    it('should update decoded field', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      expect(selectorPermission.decoded).to.be.null

      const decodedData = {
        functionName: 'approve',
        contractName: 'ERC20',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          { name: 'spender', type: 'address', value: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
          { name: 'amount', type: 'uint256', value: '999999999999999999' },
        ],
        notice: 'Approve spender to spend tokens',
      }

      const updatedPermission = await selectorPermission.update({
        decoded: decodedData,
      })

      expect(updatedPermission.decoded).to.be.an('object')
      expect(updatedPermission.decoded.functionName).to.equal(decodedData.functionName)
      expect(updatedPermission.decoded.contractName).to.equal(decodedData.contractName)
      expect(updatedPermission.decoded.proxyName).to.be.null
      expect(updatedPermission.decoded.implementationAddress).to.be.null
      expect(updatedPermission.decoded.inputs).to.deep.equal(decodedData.inputs)
      expect(updatedPermission.decoded.notice).to.equal(decodedData.notice)
    })

    it('should handle decoded with minimal data', async () => {
      const minimalDecoded = {
        functionName: 'unknown',
        contractName: null,
        proxyName: null,
        implementationAddress: null,
        inputs: null,
        notice: null,
      }

      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        decoded: minimalDecoded,
      })

      expect(selectorPermission.decoded.functionName).to.equal('unknown')
      expect(selectorPermission.decoded.contractName).to.be.null
      expect(selectorPermission.decoded.proxyName).to.be.null
      expect(selectorPermission.decoded.implementationAddress).to.be.null
      expect(selectorPermission.decoded.inputs).to.be.null
      expect(selectorPermission.decoded.notice).to.be.null
    })

    it('should handle decoded with complex inputs', async () => {
      const complexDecoded = {
        functionName: 'swapExactTokensForTokens',
        contractName: 'UniswapV2Router',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          { name: 'amountIn', type: 'uint256', value: '1000000' },
          { name: 'amountOutMin', type: 'uint256', value: '900000' },
          {
            name: 'path',
            type: 'address[]',
            value: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
          },
          { name: 'to', type: 'address', value: '0x3333333333333333333333333333333333333333' },
          { name: 'deadline', type: 'uint256', value: '1234567890' },
        ],
        notice: 'Swap tokens through Uniswap',
      }

      const selectorPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        decoded: complexDecoded,
      })

      expect(selectorPermission.decoded.functionName).to.equal(complexDecoded.functionName)
      expect(selectorPermission.decoded.inputs).to.have.lengthOf(5)
      expect(selectorPermission.decoded.inputs[2].type).to.equal('address[]')
      expect(selectorPermission.decoded.inputs[2].value).to.be.an('array').with.lengthOf(2)
    })
  })

  describe('findWithPagination', () => {
    it('should include decoded field in pagination results', async () => {
      const decodedData = {
        functionName: 'mint',
        contractName: 'ERC20Mintable',
        proxyName: null,
        implementationAddress: null,
        inputs: [
          { name: 'to', type: 'address', value: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
          { name: 'amount', type: 'uint256', value: '5000000000000000000' },
        ],
        notice: 'Mint new tokens',
      }

      await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        decoded: decodedData,
      })

      const result = await Models.SelectorPermission.findWithPagination({
        paginationParams: { limit: 10, skip: 0 },
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].decoded).to.be.an('object')
      expect(result.data[0].decoded.functionName).to.equal(decodedData.functionName)
      expect(result.data[0].decoded.contractName).to.equal(decodedData.contractName)
      expect(result.data[0].decoded.inputs).to.deep.equal(decodedData.inputs)
    })

    it('should filter by isAllowed and return decoded data', async () => {
      // Create allowed permission with decoded data
      const allowedWithDecoded = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        transactionHash: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        logIndex: 10,
        isAllowed: true,
        decoded: {
          functionName: 'transfer',
          contractName: 'ERC20',
          proxyName: null,
          implementationAddress: null,
          inputs: [],
          notice: 'Transfer tokens',
        },
      })

      // Create disallowed permission (should not be returned)
      await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        transactionHash: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        logIndex: 11,
        isAllowed: false,
        decoded: {
          functionName: 'burn',
          contractName: 'ERC20',
          proxyName: null,
          implementationAddress: null,
          inputs: [],
          notice: 'Burn tokens',
        },
      })

      const result = await Models.SelectorPermission.findWithPagination({
        paginationParams: { limit: 10, skip: 0 },
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].id).to.equal(allowedWithDecoded.id)
      expect(result.data[0].decoded.functionName).to.equal('transfer')
    })
  })

  describe('findByPluginAndDao', () => {
    it('should find selector permissions by plugin and dao', async () => {
      await Models.SelectorPermission.create({ ...rawSelectorPermission })
      await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        transactionHash: '0x5555555555555545555555555555555555555555555555555555555555555555',
        selector: '0x87654321',
        logIndex: 1,
        transactionIndex: 1,
      })

      const permissions = await Models.SelectorPermission.findByPluginAndDao(
        rawSelectorPermission.pluginAddress,
        rawSelectorPermission.daoAddress,
        rawSelectorPermission.network,
      )

      expect(permissions).to.be.an('array')
      expect(permissions).to.have.lengthOf(2)
      permissions.forEach(permission => {
        expect(permission.pluginAddress).to.equal(rawSelectorPermission.pluginAddress)
        expect(permission.daoAddress).to.equal(rawSelectorPermission.daoAddress)
        expect(permission.network).to.equal(rawSelectorPermission.network)
      })
    })
  })

  describe('findAllowedSelectors', () => {
    it('should find only allowed selectors', async () => {
      const allowedPermission = await Models.SelectorPermission.create({
        ...rawSelectorPermission,
        transactionHash: '0x6666666666666666666666666666666666666666666666666666666666666666',
        selector: '0x11111111',
        logIndex: 2, // Make sure logIndex is different
      })

      const allowedSelectors = await Models.SelectorPermission.findAllowedSelectors(
        rawSelectorPermission.pluginAddress,
        rawSelectorPermission.daoAddress,
        rawSelectorPermission.conditionAddress,
        rawSelectorPermission.network,
      )

      expect(allowedSelectors).to.be.an('array')
      expect(allowedSelectors).to.have.lengthOf(1)
      expect(allowedSelectors[0].id).to.equal(allowedPermission.id)
      expect(allowedSelectors[0].isAllowed).to.be.true
    })
  })

  describe('findBySelector', () => {
    it('should find selector permission by specific selector and target', async () => {
      await Models.SelectorPermission.create(rawSelectorPermission)

      const foundPermission = await Models.SelectorPermission.findBySelector(
        rawSelectorPermission.pluginAddress,
        rawSelectorPermission.daoAddress,
        rawSelectorPermission.conditionAddress,
        rawSelectorPermission.selector,
        rawSelectorPermission.target,
        rawSelectorPermission.network,
      )

      expect(foundPermission).to.be.an('object')
      expect(foundPermission?.selector).to.equal(rawSelectorPermission.selector)
      expect(foundPermission?.target).to.equal(rawSelectorPermission.target)
      expect(foundPermission?.isAllowed).to.be.true
    })

    it('should find ETH transfer permission with null selector', async () => {
      const ethTransferPermission = {
        ...rawSelectorPermission,
        selector: null,
      }
      await Models.SelectorPermission.create(ethTransferPermission)

      const foundPermission = await Models.SelectorPermission.findBySelector(
        ethTransferPermission.pluginAddress,
        ethTransferPermission.daoAddress,
        ethTransferPermission.conditionAddress,
        null,
        ethTransferPermission.target,
        ethTransferPermission.network,
      )

      expect(foundPermission).to.be.an('object')
      expect(foundPermission?.selector).to.be.null
      expect(foundPermission?.target).to.equal(ethTransferPermission.target)
      expect(foundPermission?.isAllowed).to.be.true
    })

    it('should return null when no matching selector permission is found', async () => {
      await Models.SelectorPermission.create(rawSelectorPermission)

      const foundPermission = await Models.SelectorPermission.findBySelector(
        rawSelectorPermission.pluginAddress,
        rawSelectorPermission.daoAddress,
        rawSelectorPermission.conditionAddress,
        '0x99999999',
        rawSelectorPermission.target,
        rawSelectorPermission.network,
      )

      expect(foundPermission).to.be.null
    })
  })

  describe('update', () => {
    it('should update selector permission', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)

      const updatedPermission = await selectorPermission.update({
        isAllowed: false,
        disallowed: {
          status: true,
          transactionHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
          blockNumber: 67890,
          blockTimestamp: 9876543210,
        },
      })

      expect(updatedPermission.isAllowed).to.be.false
      expect(updatedPermission.disallowed.status).to.be.true
      expect(updatedPermission.disallowed.transactionHash).to.equal(
        '0x9999999999999999999999999999999999999999999999999999999999999999',
      )
      expect(updatedPermission.disallowed.blockNumber).to.equal(67890)
      expect(updatedPermission.disallowed.blockTimestamp).to.equal(9876543210)
    })

    it('should update target address', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)
      const newTarget = '0x7777777777777777777777777777777777777777'

      const updatedPermission = await selectorPermission.update({
        target: newTarget,
      })

      expect(updatedPermission.target).to.equal(newTarget)
    })
  })

  describe('reload', () => {
    it('should reload selector permission', async () => {
      const selectorPermission = await Models.SelectorPermission.create(rawSelectorPermission)
      const reloaded = await selectorPermission.reload()

      expect(reloaded.id).to.equal(selectorPermission.id)
      expect(reloaded.selector).to.equal(rawSelectorPermission.selector)
      expect(reloaded.target).to.equal(rawSelectorPermission.target)
      expect(reloaded.isAllowed).to.equal(rawSelectorPermission.isAllowed)
    })
  })
})
