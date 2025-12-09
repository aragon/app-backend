import * as sinon from 'sinon'
import { expect } from 'chai'
import { Erc20TransferProcessor } from '@transfers'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import { ITransactionType, ITransactionSide, NetworksEnum, ITokenType } from '@types'

describe('Transfers: Erc20TransferProcessor', () => {
  let sandbox: sinon.SinonSandbox
  let processor: Erc20TransferProcessor

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    processor = new Erc20TransferProcessor(NetworksEnum.ethereumMainnet, '0xdaoAddress', 18, ITransactionSide.deposit)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      const customProcessor = new Erc20TransferProcessor(
        NetworksEnum.polygonMainnet,
        '0xCustomDao',
        6,
        ITransactionSide.withdraw,
      )

      expect(customProcessor['network']).to.equal(NetworksEnum.polygonMainnet)
      expect(customProcessor['daoAddress']).to.equal('0xCustomDao')
      expect(customProcessor['decimals']).to.equal(6)
      expect(customProcessor['transactionSide']).to.equal(ITransactionSide.withdraw)
    })

    it('should use default values when not provided', () => {
      const defaultProcessor = new Erc20TransferProcessor(NetworksEnum.ethereumMainnet, '0xdaoAddress')

      expect(defaultProcessor['decimals']).to.equal(18)
      expect(defaultProcessor['transactionSide']).to.equal(ITransactionSide.deposit)
    })
  })

  describe('getTransferType', () => {
    it('should return ERC20 transfer type', () => {
      expect(processor.getTransferType()).to.equal(ITransactionType.erc20)
    })
  })

  describe('validateTransfer', () => {
    it('should return true for valid ERC20 transfer event', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('1000000000000000000')],
        signature: 'Transfer(address,address,uint256)',
      }

      expect(processor.validateTransfer(parsedEvent as any)).to.be.true
    })

    it('should return false for invalid event with wrong number of args', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto'],
        signature: 'Transfer(address,address)',
      }

      expect(processor.validateTransfer(parsedEvent as any)).to.be.false
    })

    it('should return false for event with more than 3 args', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('1000'), 'extra'],
        signature: 'Transfer(address,address,uint256,string)',
      }

      expect(processor.validateTransfer(parsedEvent as any)).to.be.false
    })
  })

  describe('prepareTransferData', () => {
    it('should prepare transfer data correctly for deposit', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfromAddress', '0xtoAddress', BigInt('1000000000000000000')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xTokenAddress',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      expect(result).to.deep.equal({
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.erc20,
        fromAddress: '0xfromAddress',
        toAddress: '0xtoAddress',
        value: '1.0', // 1e18 / 1e18 = 1
        daoAddress: '0xdaoAddress',
        tokenAddress: '0xTokenAddress',
        logIndex: 0,
        transactionIndex: 1,
      })
    })

    it('should handle different decimals correctly', () => {
      const customProcessor = new Erc20TransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0xdaoAddress',
        6, // USDC has 6 decimals
        ITransactionSide.deposit,
      )

      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('1000000')], // 1 USDC
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xUSDC',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = customProcessor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.value).to.equal('1.0')
    })

    it('should handle withdrawal transaction type', () => {
      const withdrawProcessor = new Erc20TransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0xdaoAddress',
        18,
        ITransactionSide.withdraw,
      )

      const parsedEvent = {
        name: 'Transfer',
        args: ['0xdaoAddress', '0xRecipient', BigInt('2000000000000000000')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = withdrawProcessor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.side).to.equal(ITransactionSide.withdraw)
      expect(result.fromAddress).to.equal('0xdaoAddress')
      expect(result.toAddress).to.equal('0xRecipient')
      expect(result.value).to.equal('2.0')
    })

    it('should handle very large numbers', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xfrom',
          '0xto',
          BigInt('1000000000000000000000000'), // 1 million tokens
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xToken',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.value).to.equal('1000000.0')
    })
  })

  describe('save', () => {
    let checkExistingStub: sinon.SinonStub
    let addTokenMetadataStub: sinon.SinonStub
    let persistStub: sinon.SinonStub

    beforeEach(() => {
      checkExistingStub = sandbox.stub(processor as any, 'checkExisting')
      addTokenMetadataStub = sandbox.stub(processor as any, 'addTokenMetadata')
      persistStub = sandbox.stub(processor as any, 'persist')
    })

    it('should save a new transaction successfully', async () => {
      const transferData = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.erc20,
        value: '1.0',
        tokenAddress: '0xToken',
      }

      const enrichedData = { ...transferData, token: { symbol: 'TEST' } }
      const savedTransaction = { id: 'tx-1', ...enrichedData }

      checkExistingStub.resolves(null)
      addTokenMetadataStub.resolves(enrichedData)
      persistStub.resolves(savedTransaction)

      const verboseStub = sandbox.stub(logger, 'verbose')

      const result = await processor.save(transferData as any)

      expect(checkExistingStub.calledOnceWith(transferData)).to.be.true
      expect(addTokenMetadataStub.calledOnceWith(transferData)).to.be.true
      expect(persistStub.calledOnceWith(enrichedData)).to.be.true
      expect(result).to.equal(savedTransaction)
      expect(verboseStub.called).to.be.false // No verbose log for new tx in save method
    })

    it('should return existing transaction if already exists', async () => {
      const transferData = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
      }

      const existingTx = { id: 'existing-tx-1', ...transferData }

      checkExistingStub.resolves(existingTx)
      const verboseStub = sandbox.stub(logger, 'verbose')

      const result = await processor.save(transferData as any)

      expect(checkExistingStub.calledOnceWith(transferData)).to.be.true
      expect(addTokenMetadataStub.called).to.be.false
      expect(persistStub.called).to.be.false
      expect(result).to.equal(existingTx)
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.firstCall.args[0]).to.include('Transaction already exists')
    })

    it('should handle errors gracefully', async () => {
      const transferData = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
      }

      checkExistingStub.resolves(null)
      addTokenMetadataStub.rejects(new Error('Token not found'))

      const errorStub = sandbox.stub(logger, 'error')

      const result = await processor.save(transferData as any)

      expect(result).to.be.undefined
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.include('Error saving transfer')
    })

    it('should return undefined when addTokenMetadata returns null (scam token)', async () => {
      const transferData = {
        transactionHash: '0xScamTokenTx',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xScamToken',
      }

      checkExistingStub.resolves(null)
      addTokenMetadataStub.resolves(null)

      const result = await processor.save(transferData as any)

      expect(checkExistingStub.calledOnceWith(transferData)).to.be.true
      expect(addTokenMetadataStub.calledOnceWith(transferData)).to.be.true
      expect(persistStub.called).to.be.false
      expect(result).to.be.undefined
    })
  })

  describe('checkExisting', () => {
    it('should check for existing transaction with correct parameters', async () => {
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)

      const data = {
        transactionHash: '0xTxHash',
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0xdaoAddress',
        logIndex: 0,
        transactionIndex: 1,
        tokenAddress: '0xToken',
        tokenId: undefined,
        erc721TokenId: undefined,
        proposalIndex: undefined,
        actionIndex: undefined,
      }

      await processor['checkExisting'](data as any)

      expect(findExistingLogStub.calledOnce).to.be.true
      expect(
        findExistingLogStub.calledWith({
          transactionHash: '0xTxHash',
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0xdaoAddress',
          type: ITransactionType.erc20,
          logIndex: 0,
          transactionIndex: 1,
          tokenAddress: '0xToken',
          tokenId: undefined,
          proposalId: undefined,
          actionIndex: undefined,
        }),
      ).to.be.true
    })
  })

  describe('addTokenMetadata', () => {
    let saveAndGetTokenStub: sinon.SinonStub
    let getBlockTimestampStub: sinon.SinonStub

    beforeEach(() => {
      saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp')
    })

    it('should enrich transfer data with token information', async () => {
      const data = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xTokenAddress',
        value: '100.5',
      }

      const mockToken = {
        address: '0xTokenAddress',
        symbol: 'TEST',
        name: 'Test Token',
        type: ITokenType.ERC20,
        logo: 'logo.png',
        decimals: 18,
      }

      saveAndGetTokenStub.resolves(mockToken as any)
      getBlockTimestampStub.resolves(1625000000)

      const result = await processor['addTokenMetadata'](data as any)

      expect(saveAndGetTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getBlockTimestampStub.calledWith(12345, NetworksEnum.ethereumMainnet)).to.be.true

      expect(result).to.deep.equal({
        ...data,
        blockTimestamp: 1625000000,
        tokenAddress: '0xTokenAddress',
        token: {
          network: NetworksEnum.ethereumMainnet,
          address: '0xTokenAddress',
          symbol: 'TEST',
          name: 'Test Token',
          type: ITokenType.ERC20,
          logo: 'logo.png',
          decimals: 18,
          snapshot: {
            priceUsd: '0',
            priceUpdatedAt: 1625000000,
          },
        },
        amountUsd: '0',
      })
    })

    it('should use blockTimestamp if provided', async () => {
      const data = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        blockTimestamp: 1625111111,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xToken',
        value: '10',
      }

      const mockToken = {
        address: '0xToken',
        symbol: 'TEST',
        name: 'Test Token',
        type: ITokenType.ERC20,
        decimals: 18,
      }

      saveAndGetTokenStub.resolves(mockToken as any)

      const result = (await processor['addTokenMetadata'](data as any)) as any

      expect(getBlockTimestampStub.called).to.be.false
      expect(result.blockTimestamp).to.equal(1625111111)
      expect(result.amountUsd).to.equal('0')
    })

    it('should use zero address if tokenAddress not provided', async () => {
      const data = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        value: '1',
      }

      const mockToken = {
        address: utils.zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        type: ITokenType.native,
        decimals: 18,
      }

      saveAndGetTokenStub.resolves(mockToken as any)
      getBlockTimestampStub.resolves(1625000000)

      const result = (await processor['addTokenMetadata'](data as any)) as any

      expect(saveAndGetTokenStub.calledWith(utils.zeroAddress, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result.amountUsd).to.equal('0')
    })

    it('should return null if token not found (scam token)', async () => {
      const data = {
        tokenAddress: '0xScamToken',
        network: NetworksEnum.ethereumMainnet,
      }

      saveAndGetTokenStub.resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')

      const result = await processor['addTokenMetadata'](data as any)

      expect(result).to.be.null
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.firstCall.args[0]).to.include('Failed to get token information. Possible Scam Token')
    })
  })

  describe('persist', () => {
    it('should persist transaction using DbTx', async () => {
      const data = {
        transactionHash: '0xTxHash',
        value: '100',
        token: { symbol: 'TEST' },
      }

      const mockTransaction = { id: 'tx-123', ...data }
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async fn => {
        return await fn({ session: mockSession })
      })

      const createStub = sandbox.stub(Models.Transaction, 'create').resolves(mockTransaction)
      const verboseStub = sandbox.stub(logger, 'verbose')

      const result = await processor['persist'](data as any)

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(createStub.calledWith(data, { session: mockSession })).to.be.true
      expect(mockSession.commitTransaction.calledOnce).to.be.true
      expect(mockSession.endSession.calledOnce).to.be.true
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.firstCall.args[0]).to.include('New Transaction saved')
      expect(result).to.equal(mockTransaction)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle a complete ERC20 deposit flow', async () => {
      // Setup
      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xUserAddress',
          '0xdaoAddress',
          BigInt('5000000000000000000'), // 5 tokens
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xUSDC',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xDepositTx',
        blockNumber: 15000000,
        logIndex: 2,
        transactionIndex: 10,
      }

      const mockToken = {
        address: '0xUSDC',
        symbol: 'USDC',
        name: 'USD Coin',
        type: ITokenType.ERC20,
        decimals: 6,
        logo: 'usdc.png',
      }

      // Stub the methods
      sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1625000000)

      const mockTransaction = { id: 'tx-deposit-1' }
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async fn => {
        const mockSession = {
          commitTransaction: sandbox.stub().resolves(),
          endSession: sandbox.stub().resolves(),
        }
        return await fn({ session: mockSession })
      })
      sandbox.stub(Models.Transaction, 'create').resolves(mockTransaction)

      // Execute
      const transferData = processor.prepareTransferData(parsedEvent as any, info as any)
      const result = await processor.save(transferData)

      // Verify
      expect(result).to.equal(mockTransaction)
      expect(transferData.side).to.equal(ITransactionSide.deposit)
      expect(transferData.fromAddress).to.equal('0xUserAddress')
      expect(transferData.toAddress).to.equal('0xdaoAddress')
      expect(transferData.value).to.equal('5.0')
    })

    it('should handle a complete ERC20 withdrawal flow', async () => {
      const withdrawProcessor = new Erc20TransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0xdaoAddress',
        18,
        ITransactionSide.withdraw,
      )

      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xdaoAddress',
          '0xRecipientAddress',
          BigInt('10000000000000000000'), // 10 tokens
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xDAI',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xWithdrawTx',
        blockNumber: 15000001,
        logIndex: 0,
        transactionIndex: 5,
      }

      // Execute
      const isValid = withdrawProcessor.validateTransfer(parsedEvent as any)
      const transferData = withdrawProcessor.prepareTransferData(parsedEvent as any, info as any)

      // Verify
      expect(isValid).to.be.true
      expect(transferData.side).to.equal(ITransactionSide.withdraw)
      expect(transferData.fromAddress).to.equal('0xdaoAddress')
      expect(transferData.toAddress).to.equal('0xRecipientAddress')
      expect(transferData.value).to.equal('10.0')
      expect(transferData.tokenAddress).to.equal('0xDAI')
    })
  })
})
