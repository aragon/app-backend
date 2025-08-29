import * as sinon from 'sinon'
import { expect } from 'chai'
import { Erc721TransferProcessor } from '@transfers'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import ProxyProvider from '@modules/proxyProvider'
import { ITransactionType, ITransactionSide, NetworksEnum, ITokenType } from '@types'

describe('Transfers: Erc721TransferProcessor', () => {
  let sandbox: sinon.SinonSandbox
  let processor: Erc721TransferProcessor

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    processor = new Erc721TransferProcessor(NetworksEnum.ethereumMainnet, '0xdaoAddress', ITransactionSide.deposit)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      const customProcessor = new Erc721TransferProcessor(
        NetworksEnum.polygonMainnet,
        '0xCustomDao',
        ITransactionSide.withdraw,
      )

      expect(customProcessor['network']).to.equal(NetworksEnum.polygonMainnet)
      expect(customProcessor['daoAddress']).to.equal('0xCustomDao')
      expect(customProcessor['transactionSide']).to.equal(ITransactionSide.withdraw)
    })

    it('should use default transaction type when not provided', () => {
      const defaultProcessor = new Erc721TransferProcessor(NetworksEnum.ethereumMainnet, '0xdaoAddress')

      expect(defaultProcessor['transactionSide']).to.equal(ITransactionSide.deposit)
    })
  })

  describe('getTransferType', () => {
    it('should return ERC721 transfer type', () => {
      expect(processor.getTransferType()).to.equal(ITransactionType.erc721)
    })
  })

  describe('validateTransfer', () => {
    it('should return true for valid ERC721 transfer event', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('12345')], // tokenId as BigInt
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
        args: ['0xfrom', '0xto', BigInt('12345'), 'extra'],
        signature: 'Transfer(address,address,uint256,string)',
      }

      expect(processor.validateTransfer(parsedEvent as any)).to.be.false
    })

    it('should return true for NFT with tokenId 0', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('0')],
        signature: 'Transfer(address,address,uint256)',
      }

      expect(processor.validateTransfer(parsedEvent as any)).to.be.true
    })
  })

  describe('prepareTransferData', () => {
    it('should prepare transfer data correctly for NFT deposit', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfromAddress', '0xdaoAddress', BigInt('12345')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFTContract',
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
        type: ITransactionType.erc721,
        fromAddress: '0xfromAddress',
        toAddress: '0xdaoAddress',
        value: '1', // NFT transfers always have value of 1
        daoAddress: '0xdaoAddress',
        tokenAddress: '0xNFTContract',
        tokenId: '12345',
        erc721TokenId: '12345',
        logIndex: 0,
        transactionIndex: 1,
      })
    })

    it('should handle withdrawal transaction type', () => {
      const withdrawProcessor = new Erc721TransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0xdaoAddress',
        ITransactionSide.withdraw,
      )

      const parsedEvent = {
        name: 'Transfer',
        args: ['0xdaoAddress', '0xRecipient', BigInt('999')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFT',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xWithdrawTx',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = withdrawProcessor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.side).to.equal(ITransactionSide.withdraw)
      expect(result.fromAddress).to.equal('0xdaoAddress')
      expect(result.toAddress).to.equal('0xRecipient')
      expect(result.tokenId).to.equal('999')
      expect(result.erc721TokenId).to.equal('999')
      expect(result.value).to.equal('1')
    })

    it('should handle very large tokenIds', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xfrom',
          '0xto',
          BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'), // max uint256
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFT',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.tokenId).to.equal('115792089237316195423570985008687907853269984665640564039457584007913129639935')
      expect(result.erc721TokenId).to.equal(
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      )
    })

    it('should handle tokenId 0', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('0')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFT',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.tokenId).to.equal('0')
      expect(result.erc721TokenId).to.equal('0')
      expect(result.value).to.equal('1')
    })
  })

  describe('save (inherited)', () => {
    let checkExistingStub: sinon.SinonStub
    let addTokenMetadataStub: sinon.SinonStub
    let persistStub: sinon.SinonStub

    beforeEach(() => {
      checkExistingStub = sandbox.stub(processor as any, 'checkExisting')
      addTokenMetadataStub = sandbox.stub(processor as any, 'addTokenMetadata')
      persistStub = sandbox.stub(processor as any, 'persist')
    })

    it('should save a new NFT transaction successfully', async () => {
      const transferData = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        side: ITransactionSide.deposit,
        type: ITransactionType.erc721,
        value: '1',
        tokenAddress: '0xNFT',
        tokenId: '12345',
        erc721TokenId: '12345',
      }

      const enrichedData = {
        ...transferData,
        token: {
          symbol: 'BAYC',
          type: ITokenType.ERC721,
        },
      }
      const savedTransaction = { id: 'nft-tx-1', ...enrichedData }

      checkExistingStub.resolves(null)
      addTokenMetadataStub.resolves(enrichedData)
      persistStub.resolves(savedTransaction)

      const result = await processor.save(transferData as any)

      expect(checkExistingStub.calledOnceWith(transferData)).to.be.true
      expect(addTokenMetadataStub.calledOnceWith(transferData)).to.be.true
      expect(persistStub.calledOnceWith(enrichedData)).to.be.true
      expect(result).to.equal(savedTransaction)
    })

    it('should return existing NFT transaction if already exists', async () => {
      const transferData = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        tokenId: '999',
      }

      const existingTx = {
        id: 'existing-nft-tx-1',
        ...transferData,
        tokenId: '999',
        erc721TokenId: '999',
      }

      checkExistingStub.resolves(existingTx)
      const verboseStub = sandbox.stub(logger, 'verbose')

      const result = await processor.save(transferData as any)

      expect(checkExistingStub.calledOnceWith(transferData)).to.be.true
      expect(addTokenMetadataStub.called).to.be.false
      expect(persistStub.called).to.be.false
      expect(result).to.equal(existingTx)
      expect(verboseStub.called).to.be.true
      const verboseCallArg = verboseStub.firstCall.args[0]
      expect(verboseCallArg).to.include('Transaction already exists')
    })
  })

  describe('checkExisting (inherited)', () => {
    it('should check for existing NFT transaction with correct parameters', async () => {
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)

      const data = {
        transactionHash: '0xTxHash',
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0xdaoAddress',
        logIndex: 0,
        transactionIndex: 1,
        tokenAddress: '0xNFT',
        tokenId: '12345',
        erc721TokenId: '12345',
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
          type: ITransactionType.erc721,
          logIndex: 0,
          transactionIndex: 1,
          tokenAddress: '0xNFT',
          tokenId: '12345',
          proposalId: undefined,
          actionIndex: undefined,
        }),
      ).to.be.true
    })

    it('should handle both tokenId and erc721TokenId', async () => {
      const findExistingLogStub = sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)

      const data = {
        transactionHash: '0xTxHash',
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0xdaoAddress',
        logIndex: 0,
        transactionIndex: 1,
        tokenAddress: '0xNFT',
        tokenId: undefined,
        erc721TokenId: '999',
      }

      await processor['checkExisting'](data as any)

      expect(findExistingLogStub.calledOnce).to.be.true
      const callArgs = findExistingLogStub.firstCall.args[0]
      expect(callArgs.tokenId).to.equal('999')
    })
  })

  describe('addTokenMetadata (inherited)', () => {
    let saveAndGetTokenStub: sinon.SinonStub
    let getBlockTimestampStub: sinon.SinonStub
    let fetchTokenPriceStub: sinon.SinonStub

    beforeEach(() => {
      saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp')
      fetchTokenPriceStub = sandbox.stub(processor as any, 'fetchTokenPrice')
    })

    it('should enrich NFT transfer data with token information', async () => {
      const data = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xBAYC',
        value: '1',
        tokenId: '8888',
        erc721TokenId: '8888',
      }

      const mockToken = {
        address: '0xBAYC',
        symbol: 'BAYC',
        name: 'Bored Ape Yacht Club',
        type: ITokenType.ERC721,
        logo: 'bayc.png',
        decimals: 0, // NFTs don't have decimals
      }

      saveAndGetTokenStub.resolves(mockToken as any)
      getBlockTimestampStub.resolves(1625000000)
      fetchTokenPriceStub.resolves('50000.00') // Floor price

      const result = await processor['addTokenMetadata'](data as any)

      expect(saveAndGetTokenStub.calledWith('0xBAYC', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getBlockTimestampStub.calledWith(12345, NetworksEnum.ethereumMainnet)).to.be.true
      expect(fetchTokenPriceStub.calledWith(mockToken, 1625000000)).to.be.true

      expect(result).to.deep.equal({
        ...data,
        blockTimestamp: 1625000000,
        tokenAddress: '0xBAYC',
        token: {
          network: NetworksEnum.ethereumMainnet,
          address: '0xBAYC',
          symbol: 'BAYC',
          name: 'Bored Ape Yacht Club',
          type: ITokenType.ERC721,
          logo: 'bayc.png',
          decimals: 0,
          snapshot: {
            priceUsd: '50000.00',
            priceUpdatedAt: 1625000000,
          },
        },
        amountUsd: '50000.00', // 1 * 50000
      })
    })

    it('should handle NFT with no price data', async () => {
      const data = {
        transactionHash: '0xTxHash',
        blockNumber: 12345,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xUnknownNFT',
        value: '1',
        tokenId: '1',
      }

      const mockToken = {
        address: '0xUnknownNFT',
        symbol: 'UNKNOWN',
        name: 'Unknown NFT',
        type: ITokenType.ERC721,
        decimals: 0,
      }

      saveAndGetTokenStub.resolves(mockToken as any)
      getBlockTimestampStub.resolves(1625000000)
      fetchTokenPriceStub.resolves('0.00') // No price data

      const result = await processor['addTokenMetadata'](data as any)

      expect(result.amountUsd).to.equal('0.00')
    })
  })

  describe('Integration scenarios', () => {
    it('should handle a complete NFT deposit flow', async () => {
      // Setup
      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xCollector',
          '0xdaoAddress',
          BigInt('9999'), // NFT tokenId
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xCryptoPunks',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xNFTDepositTx',
        blockNumber: 15000000,
        logIndex: 2,
        transactionIndex: 10,
      }

      const mockToken = {
        address: '0xCryptoPunks',
        symbol: 'PUNK',
        name: 'CryptoPunks',
        type: ITokenType.ERC721,
        decimals: 0,
        logo: 'punk.png',
      }

      // Stub the methods
      sandbox.stub(Models.Transaction, 'findExistingLog').resolves(null)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1625000000)
      sandbox.stub(ProxyProvider, 'fetchHistoricalTokenPrice').resolves('100000.00')

      const mockTransaction = { id: 'nft-deposit-1' }
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async fn => {
        const mockSession = {
          commitTransaction: sandbox.stub().resolves(),
          endSession: sandbox.stub().resolves(),
        }
        return await fn({ session: mockSession })
      })
      sandbox.stub(Models.Transaction, 'create').resolves(mockTransaction)

      // Execute
      const isValid = processor.validateTransfer(parsedEvent as any)
      const transferData = processor.prepareTransferData(parsedEvent as any, info as any)
      const result = await processor.save(transferData)

      // Verify
      expect(isValid).to.be.true
      expect(result).to.equal(mockTransaction)
      expect(transferData.side).to.equal(ITransactionSide.deposit)
      expect(transferData.fromAddress).to.equal('0xCollector')
      expect(transferData.toAddress).to.equal('0xdaoAddress')
      expect(transferData.value).to.equal('1')
      expect(transferData.tokenId).to.equal('9999')
      expect(transferData.erc721TokenId).to.equal('9999')
    })

    it('should handle a complete NFT withdrawal flow', async () => {
      const withdrawProcessor = new Erc721TransferProcessor(
        NetworksEnum.ethereumMainnet,
        '0xdaoAddress',
        ITransactionSide.withdraw,
      )

      const parsedEvent = {
        name: 'Transfer',
        args: [
          '0xdaoAddress',
          '0xNewOwner',
          BigInt('1337'), // Elite NFT
        ],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xArtBlocks',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xNFTWithdrawTx',
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
      expect(transferData.toAddress).to.equal('0xNewOwner')
      expect(transferData.value).to.equal('1')
      expect(transferData.tokenId).to.equal('1337')
      expect(transferData.erc721TokenId).to.equal('1337')
      expect(transferData.tokenAddress).to.equal('0xArtBlocks')
    })

    it('should handle batch NFT transfers with different tokenIds', async () => {
      const events = [
        {
          parsedEvent: {
            name: 'Transfer',
            args: ['0xUser', '0xdaoAddress', BigInt('100')],
            signature: 'Transfer(address,address,uint256)',
          },
          info: {
            address: '0xNFT',
            network: NetworksEnum.ethereumMainnet,
            transactionHash: '0xBatchTx',
            blockNumber: 15000000,
            logIndex: 0,
            transactionIndex: 1,
          },
        },
        {
          parsedEvent: {
            name: 'Transfer',
            args: ['0xUser', '0xdaoAddress', BigInt('101')],
            signature: 'Transfer(address,address,uint256)',
          },
          info: {
            address: '0xNFT',
            network: NetworksEnum.ethereumMainnet,
            transactionHash: '0xBatchTx',
            blockNumber: 15000000,
            logIndex: 1,
            transactionIndex: 1,
          },
        },
        {
          parsedEvent: {
            name: 'Transfer',
            args: ['0xUser', '0xdaoAddress', BigInt('102')],
            signature: 'Transfer(address,address,uint256)',
          },
          info: {
            address: '0xNFT',
            network: NetworksEnum.ethereumMainnet,
            transactionHash: '0xBatchTx',
            blockNumber: 15000000,
            logIndex: 2,
            transactionIndex: 1,
          },
        },
      ]

      const transferDataArray = events.map(({ parsedEvent, info }) =>
        processor.prepareTransferData(parsedEvent as any, info as any),
      )

      // Verify each transfer has unique tokenId but same transaction
      expect(transferDataArray[0].tokenId).to.equal('100')
      expect(transferDataArray[1].tokenId).to.equal('101')
      expect(transferDataArray[2].tokenId).to.equal('102')

      // All from same transaction
      expect(transferDataArray[0].transactionHash).to.equal('0xBatchTx')
      expect(transferDataArray[1].transactionHash).to.equal('0xBatchTx')
      expect(transferDataArray[2].transactionHash).to.equal('0xBatchTx')

      // Different log indices
      expect(transferDataArray[0].logIndex).to.equal(0)
      expect(transferDataArray[1].logIndex).to.equal(1)
      expect(transferDataArray[2].logIndex).to.equal(2)

      // All NFT transfers have value of 1
      expect(transferDataArray[0].value).to.equal('1')
      expect(transferDataArray[1].value).to.equal('1')
      expect(transferDataArray[2].value).to.equal('1')
    })
  })

  describe('Comparison with ERC20', () => {
    it('should always set value to 1 unlike ERC20', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('999999999999')], // Large number
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFT',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTx',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      // NFT always has value of 1, regardless of tokenId
      expect(result.value).to.equal('1')
      // But tokenId is preserved
      expect(result.tokenId).to.equal('999999999999')
    })

    it('should store tokenId in both tokenId and erc721TokenId fields', () => {
      const parsedEvent = {
        name: 'Transfer',
        args: ['0xfrom', '0xto', BigInt('42')],
        signature: 'Transfer(address,address,uint256)',
      }

      const info = {
        address: '0xNFT',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xTx',
        blockNumber: 12345,
        logIndex: 0,
        transactionIndex: 1,
      }

      const result = processor.prepareTransferData(parsedEvent as any, info as any)

      expect(result.tokenId).to.equal('42')
      expect(result.erc721TokenId).to.equal('42')
      expect(result.value).to.equal('1')
    })
  })
})
