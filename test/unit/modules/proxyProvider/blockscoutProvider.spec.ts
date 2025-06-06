import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import BlockScoutHelper from '@helpers/blockScout'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import ProxyUtils from '@modules/proxyProvider/utils'
import { ITransactionCategory, ITransactionType, ITokenType, NetworksEnum } from '@types'
import logger from '@logger'
import utils from '@helpers/utils'

describe('Modules: BlockScoutProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('fetchAddressTxns', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    const mockTokenInfo = {
      address: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      name: 'Test Token',
      symbol: 'TT',
      decimals: 18,
      priceUsd: '1.0',
      type: ITokenType.ERC20,
    }

    const mockERC20Transfer = {
      hash: '0xhash1000000000000000000000000000000000000000000000000000000000001',
      blockNumber: '18000000',
      timestamp: 1672531200,
      from: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc1',
      to: address,
      value: '1000000000000000000',
      contractAddress: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      tokenName: 'Test Token',
      tokenSymbol: 'TT',
      tokenDecimals: 18,
      logIndex: 1,
      category: 'erc20',
    }

    const mockExternalTx = {
      hash: '0xhash2000000000000000000000000000000000000000000000000000000000002',
      blockNumber: '18000001',
      timestamp: 1672531300,
      from: address,
      to: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc2',
      value: '2000000000000000000',
      contractAddress: null,
      tokenDecimals: '18',
      transactionIndex: 1,
      category: 'external',
    }

    const mockInternalTx = {
      hash: '0xhash3000000000000000000000000000000000000000000000000000000000003',
      blockNumber: '18000002',
      timestamp: 1672531400,
      from: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc4',
      to: address,
      value: '3000000000000000000',
      contractAddress: null,
      tokenDecimals: '18',
      index: 1,
      category: 'internal',
    }

    beforeEach(() => {
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([mockERC20Transfer])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([mockExternalTx])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([mockInternalTx])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()
    })

    it('should fetch and parse all transaction types successfully', async () => {
      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.have.length(3)

      // Check ERC20 transfer
      const erc20Tx = result.find(tx => tx.category === ITransactionCategory.ERC20)
      expect(erc20Tx).to.exist
      expect(erc20Tx!.hash).to.equal('0xhash1000000000000000000000000000000000000000000000000000000000001')
      expect(erc20Tx!.type).to.equal(ITransactionType.deposit)
      expect(erc20Tx!.value).to.equal('1.0')
      expect(erc20Tx!.rawContract.symbol).to.equal('TT')

      // Check external transaction
      const externalTx = result.find(tx => tx.category === ITransactionCategory.External)
      expect(externalTx).to.exist
      expect(externalTx!.hash).to.equal('0xhash2000000000000000000000000000000000000000000000000000000000002')
      expect(externalTx!.type).to.equal(ITransactionType.withdraw)
      expect(externalTx!.value).to.equal('2.0')

      // Check internal transaction
      const internalTx = result.find(tx => tx.category === ITransactionCategory.Internal)
      expect(internalTx).to.exist
      expect(internalTx!.hash).to.equal('0xhash3000000000000000000000000000000000000000000000000000000000003')
      expect(internalTx!.type).to.equal(ITransactionType.deposit)
      expect(internalTx!.value).to.equal('3.0')
    })

    it('should determine transaction type correctly (withdraw vs deposit)', async () => {
      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      const withdrawTx = result.find(tx => tx.from.toLowerCase() === address.toLowerCase())
      const depositTx = result.find(tx => tx.to.toLowerCase() === address.toLowerCase())

      expect(withdrawTx!.type).to.equal(ITransactionType.withdraw)
      expect(depositTx!.type).to.equal(ITransactionType.deposit)
    })

    it('should filter out transactions with no token info', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([mockERC20Transfer])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.have.length(0)
    })

    it('should filter out scam tokens', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([mockERC20Transfer])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(true)
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.have.length(0)
    })

    it('should generate correct unique IDs for transactions', async () => {
      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result[0].uniqueId).to.include('0xhash1000000000000000000000000000000000000000000000000000000000001')
      expect(result[0].uniqueId).to.include('erc20')
      expect(result[0].uniqueId).to.include('1')

      expect(result[1].uniqueId).to.include('0xhash2000000000000000000000000000000000000000000000000000000000002')
      expect(result[1].uniqueId).to.include('external')
      expect(result[1].uniqueId).to.include('1')

      expect(result[2].uniqueId).to.include('0xhash3000000000000000000000000000000000000000000000000000000000003')
      expect(result[2].uniqueId).to.include('internal')
      expect(result[2].uniqueId).to.include('1')
    })

    it('should sort transactions by block number', async () => {
      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.have.length(3)
      expect(result[0].blockNum).to.be.lessThan(result[1].blockNum)
      expect(result[1].blockNum).to.be.lessThan(result[2].blockNum)
    })

    it('should update progress with the latest block number', async () => {
      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      // Verify that updateProgressInConfigIndexer was called
      const updateProgressStub = ProxyUtils.updateProgressInConfigIndexer as sinon.SinonStub
      expect(updateProgressStub.calledOnce).to.be.true
      expect(updateProgressStub.firstCall.args[0]).to.equal(network)
      expect(updateProgressStub.firstCall.args[1]).to.equal(`transferList-${address}-${network}`)
      expect(updateProgressStub.firstCall.args[2]).to.equal(18000002) // Latest block number
    })

    it('should handle empty transaction lists', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([])
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle errors gracefully', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').rejects(new Error('API Error'))
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([])
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error in fetchAddressTxns' as any)).to.be.true
    })

    it('should handle partial failures (some APIs succeed, others fail)', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([mockERC20Transfer])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').rejects(new Error('External TX API Error'))
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([mockInternalTx])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should handle zero-value transactions in native ETH', async () => {
      const mockEthTokenInfo = {
        ...mockTokenInfo,
        address: '0x0000000000000000000000000000000000000000',
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      }

      sandbox.restore()
      sandbox.stub(BlockScoutHelper, '_fetchERC20Transfers').resolves([])
      sandbox.stub(BlockScoutHelper, '_fetchTxList').resolves([mockExternalTx])
      sandbox.stub(BlockScoutHelper, '_fetchInternalTxs').resolves([])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockEthTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      const result = await BlockScoutProvider.fetchAddressTxns({ address, network })

      expect(result).to.have.length(1)
      expect(result[0].rawContract.symbol).to.equal('ETH')
      expect(result[0].category).to.equal(ITransactionCategory.External)
    })
  })

  describe('getTokenBalances', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    const mockTokenInfo = {
      address: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      name: 'Test Token',
      symbol: 'TT',
      decimals: 18,
      priceUsd: '1.0',
      type: ITokenType.ERC20,
    }

    const mockTokenBalance = {
      contractAddress: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
      tokenBalance: '1000000000000000000',
      tokenName: 'Test Token',
      tokenSymbol: 'TT',
      tokenDecimals: '18',
      tokenType: 'ERC-20',
    }

    beforeEach(() => {
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockTokenBalance])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
    })

    it('should fetch and parse token balances successfully', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(1)
      expect(result[0]).to.deep.include({
        contractAddress: '0xa0B86a33e6776896Ada63c629B4ED1d8FE7dbCc3',
        tokenBalance: '1.0',
        originalBalance: '1000000000000000000',
      })
    })

    it('should handle multiple token balances', async () => {
      const mockTokenBalances = [
        {
          contractAddress: '0xa0b86a33e6776896ada63c629b4ed1d8fe7dbcc3',
          tokenBalance: '1000000000000000000',
          tokenName: 'Test Token 1',
          tokenSymbol: 'TT1',
          tokenDecimals: '18',
          tokenType: 'ERC-20',
        },
        {
          contractAddress: '0xb0b86a33e6776896ada63c629b4ed1d8fe7dbcc4',
          tokenBalance: '500000',
          tokenName: 'Test Token 2',
          tokenSymbol: 'TT2',
          tokenDecimals: '6',
          tokenType: 'ERC-20',
        },
      ]

      const mockTokenInfo2 = {
        address: '0xb0b86a33e6776896ada63c629b4ed1d8fe7dbcc4',
        name: 'Test Token 2',
        symbol: 'TT2',
        decimals: 6,
        priceUsd: '2.0',
        type: ITokenType.ERC20,
      }

      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves(mockTokenBalances)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.onFirstCall().resolves(mockTokenInfo as any)
      saveAndGetTokenStub.onSecondCall().resolves(mockTokenInfo2 as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(2)
      expect(result[0].tokenBalance).to.equal('1.0')
      expect(result[1].tokenBalance).to.equal('0.5')
    })

    it('should filter out tokens with empty data balance', async () => {
      const mockTokenBalanceWithEmptyData = {
        ...mockTokenBalance,
        tokenBalance: '0x',
      }

      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockTokenBalanceWithEmptyData])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      sandbox.stub(utils, 'emptyData').value('0x')

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should filter out tokens that are not found in database', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockTokenBalance])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should filter out scam tokens', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockTokenBalance])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockTokenInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(true)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(0)
    })

    it('should handle NFT tokens (ERC-721)', async () => {
      const mockNFTBalance = {
        contractAddress: '0xc0b86a33e6776896ada63c629b4ed1d8fe7dbcc5',
        tokenBalance: '1',
        tokenName: 'NFT Collection',
        tokenSymbol: 'NFT',
        tokenDecimals: '0',
        tokenType: 'ERC-721',
      }

      const mockNFTInfo = {
        address: '0xc0b86a33e6776896ada63c629b4ed1d8fe7dbcc5',
        name: 'NFT Collection',
        symbol: 'NFT',
        decimals: 0,
        priceUsd: '0',
        type: ITokenType.ERC721,
      }

      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([mockNFTBalance])
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockNFTInfo as any)
      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.have.length(1)
      expect(result[0].tokenBalance).to.equal('1')
    })

    it('should handle empty token balance list', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').resolves([])

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle errors gracefully', async () => {
      sandbox.restore()
      sandbox.stub(BlockScoutHelper, 'getTokenBalances').rejects(new Error('API Error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result).to.be.an('array').that.is.empty
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error in getTokenBalances' as any)).to.be.true
    })

    it('should properly format addresses using ethers.getAddress', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result[0].contractAddress).to.equal('0xa0B86a33e6776896Ada63c629B4ED1d8FE7dbCc3')
    })

    it('should preserve original balance for reference', async () => {
      const result = await BlockScoutProvider.getTokenBalances({ address, network })

      expect(result[0].originalBalance).to.equal('1000000000000000000')
      expect(result[0].tokenBalance).to.equal('1.0')
    })
  })
})
