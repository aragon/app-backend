import { Models } from '@dbModels'
import { ExecuteHandler } from '@handlers/executeHandler'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('ExecuteHandler', () => {
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
        stateMutability: 'payable',
      }

      sandbox.stub(ContractInfo, 'parseSignature').resolves(mockDecodedAction)
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const result = (await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo))![0]

      expect(result).to.exist
      expect(result.selector).to.equal('0x12345678')
      expect(result.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(result.pluginAddress).to.equal(mockPlugin.address)
      expect(result.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(result.conditionAddress).to.equal(mockInfo.address)
      expect(result.isAllowed).to.be.true

      // Compare the decoded object as plain object
      const decodedObj = result.decoded
      expect(decodedObj.functionName).to.equal(mockDecodedAction.functionName)
      expect(decodedObj.contractName).to.equal(mockDecodedAction.contractName)
      expect(decodedObj.proxyName).to.equal(mockDecodedAction.proxyName)
      expect(decodedObj.implementationAddress).to.equal(mockDecodedAction.implementationAddress)
      expect(decodedObj.inputs).to.deep.equal(mockDecodedAction.inputs)
      expect(decodedObj.notice).to.equal(mockDecodedAction.notice)
      expect(decodedObj.stateMutability).to.equal('payable')

      expect(loggerInfoStub.calledOnce).to.be.true

      // Verify it was actually saved in the database
      const savedPermission = await Models.SelectorPermission.findOne({
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        conditionAddress: mockInfo.address,
      })
      expect(savedPermission).to.exist
    })

    it('should return an empty array if plugin not found', async () => {
      sandbox.stub(logger, 'warn')
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

      expect(result).to.deep.equal([])

      // Verify nothing was created in the database
      const permissions = await Models.SelectorPermission.find({
        conditionAddress: infoWithInvalidCondition.address,
      })
      expect(permissions).to.have.lengthOf(0)
    })

    it('should return an empty array if existing selector permission found', async () => {
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

      expect(result).to.deep.equal([])

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

  describe('selectorAllowed - cross-chain shape', () => {
    it('should store chainId and resolve the target against the destination chain', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
          chainId: BigInt(8453),
        },
      } as any

      const parseSignature = sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'withdraw', contractName: 'Vault' })
      sandbox.stub(logger, 'info')

      const result = (await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo))![0]

      expect(result).to.exist
      expect(result.chainId).to.equal(8453)
      // Emitted on mainnet, but the target contract lives on Base.
      expect(parseSignature.calledOnce).to.be.true
      expect(parseSignature.args[0][2]).to.equal(NetworksEnum.baseMainnet)
    })

    it('should fall back to the emitting chain id for the same-chain shape', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
        },
      } as any

      const parseSignature = sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'withdraw', contractName: 'Vault' })
      sandbox.stub(logger, 'info')

      const result = (await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo))![0]

      expect(result.chainId).to.equal(1)
      expect(parseSignature.args[0][2]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should still record the permission when the destination chain is not indexed', async () => {
      const parsedEvent = {
        args: {
          selector: '0x12345678',
          where: '0x3333333333333333333333333333333333333333',
          chainId: BigInt(9745),
        },
      } as any

      const parseSignature = sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'withdraw', contractName: 'Vault' })
      const loggerWarn = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')

      const result = (await ExecuteHandler.selectorAllowed(parsedEvent, mockInfo))![0]

      expect(result).to.exist
      expect(result.chainId).to.equal(9745)
      expect(result.decoded.stateMutability).to.be.null
      expect(parseSignature.called).to.be.false
      expect(loggerWarn.calledOnce).to.be.true
    })

    it('should keep per-chain rows independent when disallowing one chain', async () => {
      const where = '0x3333333333333333333333333333333333333333'
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'withdraw', contractName: 'Vault' })
      sandbox.stub(logger, 'info')
      sandbox.stub(logger, 'warn')

      await ExecuteHandler.selectorAllowed(
        { args: { selector: '0x12345678', where, chainId: BigInt(8453) } } as any,
        mockInfo,
      )
      await ExecuteHandler.selectorAllowed({ args: { selector: '0x12345678', where, chainId: BigInt(42161) } } as any, {
        ...mockInfo,
        logIndex: 1,
      })

      await ExecuteHandler.selectorDisallowed(
        { args: { selector: '0x12345678', where, chainId: BigInt(8453) } } as any,
        { ...mockInfo, logIndex: 2 },
      )

      const base = await Models.SelectorPermission.findOne({ selector: '0x12345678', target: where, chainId: 8453 })
      const arbitrum = await Models.SelectorPermission.findOne({
        selector: '0x12345678',
        target: where,
        chainId: 42161,
      })

      expect(base!.isAllowed).to.be.false
      expect(arbitrum!.isAllowed).to.be.true
    })
  })

  describe('shared condition across DAOs', () => {
    const condition = '0x2B5Ad5c4795C026514F8317c7a215E218DDccD66'
    const daoA = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1'
    const daoB = '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0'
    const pluginA = '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b'
    const pluginB = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
    const where = '0x4e59B44847B379578588920ca783CfB7fcc65347'

    beforeEach(async () => {
      for (const [address, daoAddress] of [
        [pluginA, daoA],
        [pluginB, daoB],
      ]) {
        await Models.Plugin.create({
          status: IPluginStatus.installed,
          network: NetworksEnum.ethereumMainnet,
          blockNumber: 12345,
          blockTimestamp: 1620000000,
          transactionHash: '0x123abc',
          address,
          daoAddress,
          pluginSetupRepoAddress: '0x1111111111111111111111111111111111111111',
          interfaceType: 'admin',
          conditionAddress: condition,
        })
      }
      mockInfo = { ...mockInfo, address: condition }
    })

    it('gives each DAO its own record when two DAOs share one condition', async () => {
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'info')

      const result = await ExecuteHandler.selectorAllowed({ args: { selector: '0x12345678', where } } as any, mockInfo)

      expect(result).to.have.lengthOf(2)

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition })
      expect(rows).to.have.lengthOf(2)
      expect(rows.map(r => r.daoAddress).sort()).to.deep.equal([daoA, daoB].sort())
      expect(rows.map(r => r.pluginAddress).sort()).to.deep.equal([pluginA, pluginB].sort())
      expect(rows.every(r => r.isAllowed)).to.be.true
    })

    it('clears the record of every DAO when a shared condition disallows the selector', async () => {
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'info')

      await ExecuteHandler.selectorAllowed({ args: { selector: '0x12345678', where } } as any, mockInfo)
      await ExecuteHandler.selectorDisallowed({ args: { selector: '0x12345678', where } } as any, {
        ...mockInfo,
        logIndex: 1,
      })

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition }).lean()
      expect(rows.map(row => [row.daoAddress, row.isAllowed, row.disallowed])).to.have.deep.members(
        [daoA, daoB].map(daoAddress => [
          daoAddress,
          false,
          {
            status: true,
            transactionHash: mockInfo.transactionHash,
            blockNumber: mockInfo.blockNumber,
            logIndex: 1,
            blockTimestamp: null,
          },
        ]),
      )
    })

    it('skips the decode when every DAO already has the record', async () => {
      const parseSignature = sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'info')

      const event = { args: { selector: '0x12345678', where } } as any

      await ExecuteHandler.selectorAllowed(event, mockInfo)
      expect(parseSignature.callCount).to.equal(1)

      const second = await ExecuteHandler.selectorAllowed(event, mockInfo)
      expect(second).to.deep.equal([])
      expect(parseSignature.callCount).to.equal(1)
    })

    it('keeps a newer allow when another DAO replays an older disallow', async () => {
      sandbox.stub(logger, 'warn')

      const allowRow = async (blockNumber: number, txByte: string, isAllowed: boolean) =>
        Models.SelectorPermission.create({
          network: NetworksEnum.ethereumMainnet,
          transactionHash: `0x${txByte.padStart(64, '0')}`,
          transactionIndex: 0,
          logIndex: 0,
          blockNumber,
          blockTimestamp: 1620000000,
          conditionAddress: condition,
          daoAddress: daoA,
          pluginAddress: pluginA,
          selector: '0x12345678',
          target: where,
          chainId: 1,
          isAllowed,
        })

      // DAO A: allowed at block 10, disallowed, then allowed again at block 30.
      await allowRow(10, 'aa', false)
      await allowRow(30, 'bb', true)

      // DAO B's crawl replays the disallow from an old block.
      await ExecuteHandler.selectorDisallowed({ args: { selector: '0x12345678', where } } as any, {
        ...mockInfo,
        blockNumber: 20,
      })

      const newerAllow = await Models.SelectorPermission.findOne({
        conditionAddress: condition,
        daoAddress: daoA,
        blockNumber: 30,
      })
      expect(newerAllow!.isAllowed).to.be.true
      const daoBRows = await Models.SelectorPermission.find({ daoAddress: daoB }).lean()
      expect(daoBRows.map(row => [row.blockNumber, row.isAllowed])).to.deep.equal([[20, false]])
    })

    const seedAllow = (row: { daoAddress: string; pluginAddress: string; blockNumber: number; chainId?: number }) =>
      Models.SelectorPermission.create({
        network: NetworksEnum.ethereumMainnet,
        transactionHash: `0x${row.blockNumber.toString(16).padStart(64, '0')}`,
        transactionIndex: 0,
        logIndex: 0,
        blockTimestamp: 1620000000,
        conditionAddress: condition,
        selector: '0x12345678',
        target: where,
        chainId: 1,
        isAllowed: true,
        ...row,
      })

    const disallowAt = (blockNumber: number) =>
      ExecuteHandler.selectorDisallowed({ args: { selector: '0x12345678', where } } as any, {
        ...mockInfo,
        blockNumber,
      })

    it('does not clear an allow for another destination chain', async () => {
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, blockNumber: 10 })
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, blockNumber: 11, chainId: 42161 })

      // same-chain disallow: the event has no chainId arg
      await disallowAt(20)

      const rows = await Models.SelectorPermission.find({ daoAddress: daoA }).lean()
      expect(rows.map(row => [row.chainId, row.isAllowed])).to.have.deep.members([
        [1, false],
        [42161, true],
      ])
    })

    it('writes only the missing record when one DAO already has it', async () => {
      const parseSignature = sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'info')
      const event = { args: { selector: '0x12345678', where } } as any
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, ...mockInfo })

      const written = await ExecuteHandler.selectorAllowed(event, mockInfo)

      expect(written!.map(row => row.daoAddress)).to.deep.equal([daoB])
      expect(await Models.SelectorPermission.countDocuments({ conditionAddress: condition })).to.equal(2)
      expect(parseSignature.callCount).to.equal(1)
    })

    it('clears the DAO that has the allow and stores the disallow for the DAO that has none yet', async () => {
      const warn = sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, blockNumber: 10 })

      await disallowAt(20)

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition }).lean()
      expect(rows.map(row => [row.daoAddress, row.blockNumber, row.isAllowed])).to.have.deep.members([
        [daoA, 10, false],
        [daoB, 20, false],
      ])
      expect(warn.calledWithMatch('Selector not found for disallowing' as any)).to.be.true
    })

    it('stores a replayed disallow only once', async () => {
      sandbox.stub(logger, 'warn')

      await disallowAt(20)
      await disallowAt(20)

      expect(await Models.SelectorPermission.countDocuments({ conditionAddress: condition })).to.equal(2)
    })

    it('writes no extra record when the replayed disallow already cleared the allow', async () => {
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, blockNumber: 10 })
      await seedAllow({ daoAddress: daoB, pluginAddress: pluginB, blockNumber: 10 })

      await disallowAt(20)
      await disallowAt(20)

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition }).lean()
      expect(rows.map(row => [row.daoAddress, row.isAllowed, row.disallowed?.blockNumber])).to.have.deep.members([
        [daoA, false, 20],
        [daoB, false, 20],
      ])
    })

    const allowAt = (blockNumber: number) =>
      ExecuteHandler.selectorAllowed({ args: { selector: '0x12345678', where } } as any, {
        ...mockInfo,
        blockNumber,
        transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
      })

    it('stores an old allow that arrives after its disallow as already disallowed', async () => {
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')

      await disallowAt(20)
      await allowAt(10)

      const allows = await Models.SelectorPermission.find({ conditionAddress: condition, blockNumber: 10 }).lean()
      expect(allows.map(row => [row.daoAddress, row.isAllowed, row.disallowed?.blockNumber])).to.have.deep.members([
        [daoA, false, 20],
        [daoB, false, 20],
      ])
    })

    it('keeps an allow that comes after the disallow', async () => {
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'warn')
      sandbox.stub(logger, 'info')

      await disallowAt(20)
      await allowAt(30)

      const allows = await Models.SelectorPermission.find({ conditionAddress: condition, blockNumber: 30 }).lean()
      expect(allows.map(row => [row.daoAddress, row.isAllowed])).to.have.deep.members([
        [daoA, true],
        [daoB, true],
      ])
    })

    it('gives no record to an uninstalled process on the condition', async () => {
      sandbox.stub(ContractInfo, 'parseSignature').resolves({ functionName: 'transfer', contractName: 'Token' })
      sandbox.stub(logger, 'info')
      await Models.Plugin.updateOne({ address: pluginB }, { status: IPluginStatus.uninstalled })

      await ExecuteHandler.selectorAllowed({ args: { selector: '0x12345678', where } } as any, mockInfo)

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition }).lean()
      expect(rows.map(row => row.daoAddress)).to.deep.equal([daoA])
    })

    it('clears only the DAO of the installed process when one Safe is a process in two DAOs', async () => {
      sandbox.stub(logger, 'info')
      // the same Safe is a process in DAO A and was a process in DAO B, whose copy is newer
      await Models.Plugin.updateOne({ address: pluginB }, { address: pluginA, status: IPluginStatus.uninstalled })
      await seedAllow({ daoAddress: daoA, pluginAddress: pluginA, blockNumber: 10 })
      await seedAllow({ daoAddress: daoB, pluginAddress: pluginA, blockNumber: 15 })

      await disallowAt(20)

      const rows = await Models.SelectorPermission.find({ conditionAddress: condition }).lean()
      expect(rows.map(row => [row.daoAddress, row.isAllowed])).to.have.deep.members([
        [daoA, false],
        [daoB, true],
      ])
    })

    it('gives each DAO its own native transfer record and clears both', async () => {
      sandbox
        .stub(ContractInfo, 'parseSignature')
        .resolves({ functionName: 'NativeTransfer', contractName: 'Contract' })
      sandbox.stub(logger, 'info')

      const written = await ExecuteHandler.nativeTransfersAllowed({ args: { where } } as any, mockInfo)
      await ExecuteHandler.nativeTransfersDisallowed({ args: { where } } as any, { ...mockInfo, logIndex: 1 })

      expect(written).to.have.lengthOf(2)
      const rows = await Models.SelectorPermission.find({ conditionAddress: condition, selector: null }).lean()
      expect(rows.map(row => [row.daoAddress, row.isAllowed])).to.have.deep.members([
        [daoA, false],
        [daoB, false],
      ])
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
        // Post-backfill-migration state: same-chain rows carry their network's chain id.
        chainId: 1,
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

    it('should warn and store the disallow if the selector permission is not found', async () => {
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
      const stored = await Models.SelectorPermission.findOne({ selector: '0x87654321' }).lean()
      expect(stored).to.include({ isAllowed: false, blockNumber: mockInfo.blockNumber })
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

      const result = (await ExecuteHandler.nativeTransfersAllowed(parsedEvent, mockInfo))![0]

      expect(result).to.exist
      expect(result.selector).to.be.null
      expect(result.target).to.equal('0x3333333333333333333333333333333333333333')
      expect(result.pluginAddress).to.equal(mockPlugin.address)
      expect(result.daoAddress).to.equal(mockPlugin.daoAddress)
      expect(result.conditionAddress).to.equal(mockInfo.address)
      expect(result.isAllowed).to.be.true

      // Compare the decoded object as plain object
      const decodedObj = result.decoded
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

      expect(result).to.deep.equal([])

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
      sandbox.stub(logger, 'info')
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
        // Post-backfill-migration state: same-chain rows carry their network's chain id.
        chainId: 1,
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

    it('clears both native transfer allows when it was allowed twice before the disallow', async () => {
      const where = '0x3333333333333333333333333333333333333333'
      for (const blockNumber of [12340, 12342]) {
        await Models.SelectorPermission.create({
          network: mockInfo.network,
          transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
          transactionIndex: 0,
          logIndex: 0,
          blockNumber,
          blockTimestamp: 1620000000,
          conditionAddress: mockInfo.address,
          pluginAddress: mockPlugin.address,
          daoAddress: mockPlugin.daoAddress,
          selector: null,
          target: where,
          chainId: 1,
          isAllowed: true,
        })
      }
      sandbox.stub(logger, 'info')

      await ExecuteHandler.nativeTransfersDisallowed({ args: { where } } as any, mockInfo)

      const rows = await Models.SelectorPermission.find({ target: where, selector: null }).lean()
      expect(rows.map(row => [row.blockNumber, row.isAllowed, row.disallowed?.blockNumber])).to.have.deep.members([
        [12340, false, mockInfo.blockNumber],
        [12342, false, mockInfo.blockNumber],
      ])
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
    beforeEach(() => {
      sandbox.stub(logger, 'info')
    })

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

      const allowResult = (await ExecuteHandler.selectorAllowed(allowEvent, mockInfo))![0]
      expect(allowResult).to.exist
      expect(allowResult.isAllowed).to.be.true

      // Step 2: Disallow selector
      const disallowEvent = {
        args: { selector, where: target },
      } as any

      await ExecuteHandler.selectorDisallowed(disallowEvent, { ...mockInfo, logIndex: mockInfo.logIndex + 1 })

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

      const allowResult = (await ExecuteHandler.nativeTransfersAllowed(allowEvent, mockInfo))![0]
      expect(allowResult).to.exist
      expect(allowResult.isAllowed).to.be.true
      expect(allowResult.selector).to.be.null

      // Step 2: Disallow native transfers
      const disallowEvent = {
        args: { where: target },
      } as any

      await ExecuteHandler.nativeTransfersDisallowed(disallowEvent, { ...mockInfo, logIndex: mockInfo.logIndex + 1 })

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

  describe('_createSelectorPermission', () => {
    const selectorParams = () => ({
      network: mockInfo.network,
      transactionHash: mockInfo.transactionHash,
      transactionIndex: mockInfo.transactionIndex,
      logIndex: mockInfo.logIndex,
      conditionAddress: mockInfo.address,
      daoAddress: mockPlugin.daoAddress,
      pluginAddress: mockPlugin.address,
    })

    it('returns the row the other worker wrote when both handled the same log', async () => {
      const params = selectorParams()
      const winner = await Models.SelectorPermission.create({
        ...params,
        blockNumber: mockInfo.blockNumber,
        blockTimestamp: 1620000000,
        pluginAddress: mockPlugin.address,
        daoAddress: mockPlugin.daoAddress,
        selector: '0x12345678',
        target: '0x3333333333333333333333333333333333333333',
        chainId: 1,
        isAllowed: true,
      })

      // What the unique index on the entity id throws at the worker that comes second.
      const duplicateKey: any = new Error(
        `E11000 duplicate key error collection: ${Models.SelectorPermission.db.name}.${Models.SelectorPermission.collection.collectionName} index: id_1`,
      )
      duplicateKey.code = 11000
      duplicateKey.keyValue = { id: winner.id }
      sandbox.stub(Models.SelectorPermission, 'create').rejects(duplicateKey)

      const result = await ExecuteHandler._createSelectorPermission({ ...params })

      expect(result).to.exist
      expect(result!.id).to.equal(winner.id)
      expect(await Models.SelectorPermission.countDocuments({ id: winner.id })).to.equal(1)
    })

    it('rethrows anything that is not a duplicate', async () => {
      sandbox.stub(Models.SelectorPermission, 'create').rejects(new Error('mongo is down'))

      const error = await ExecuteHandler._createSelectorPermission({}).catch((e: any) => e)

      expect(error).to.be.an('error')
      expect(error.message).to.equal('mongo is down')
    })
  })
})
