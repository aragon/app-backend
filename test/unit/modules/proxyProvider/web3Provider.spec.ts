import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, ITransactionCategory } from '@types'
import logger from '@logger'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import BlockScoutHelper from '@helpers/blockScout'
import EtherscanHelper from '@helpers/etherscan'
import CovalentHelper from '@helpers/covalent'
import utils from '@helpers/utils'
import Alchemy from '@helpers/alchemy'
import Web3Utils from '@helpers/web3Utils'
import { RateModule } from '@modules/rates'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import ProxyUtils from '@modules/proxyProvider/utils'
import AnkrHelper from '@helpers/ankrHelper'
import BottleneckModule from '@src/modules/bottleneck'

describe('Web3Provider', () => {
  let sandbox: any
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getNativeBalance', () => {
    it('should return properly formatted balance when valid balance is returned', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '1000000000000000000' // 1 ETH
      const mockToken = { address: utils.zeroAddress, decimals: 18 }
      const expectedFormattedBalance = '1'

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const handleAlchemyCrazyBalanceStub = sandbox
        .stub(Alchemy, 'handleAlchemyCrazyBalance')
        .returns(expectedFormattedBalance)
      const alchemyCrazyBalanceOnErrorStub = sandbox.stub(Alchemy, 'alchemyCrazyBalanceOnError')

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(saveAndGetTokenStub.calledOnceWith(utils.zeroAddress, network)).to.be.true
      expect(handleAlchemyCrazyBalanceStub.calledOnceWith(balance, mockToken.decimals)).to.be.true
      expect(alchemyCrazyBalanceOnErrorStub.calledOnce).to.be.true
      expect(result).to.equal(expectedFormattedBalance)
    })

    it('should return 0 when balance is 0', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '0'

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.equal('0')
    })

    it('should return 0 when token is not found', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '1000000000000000000' // 1 ETH

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(saveAndGetTokenStub.calledOnceWith(utils.zeroAddress, network)).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.equal('0')
    })
  })

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = '1000000000000000000' // 1 Token
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const token1 = { address: token1Address, decimals: 18 }
      const token2 = { address: token2Address, decimals: 18 }

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(token1)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(token2)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs(token1Address).returns(token1Address)
      parseAddressStub.withArgs(token2Address).returns(token2Address)

      const handleAlchemyCrazyBalanceStub = sandbox.stub(Alchemy, 'handleAlchemyCrazyBalance')
      handleAlchemyCrazyBalanceStub.withArgs(token1Balance, token1.decimals).returns('1')
      handleAlchemyCrazyBalanceStub.withArgs(token2Balance, token2.decimals).returns('2')

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        contractAddress: token1Address,
        tokenBalance: '1',
        originalBalance: token1Balance,
      })
      expect(result[1]).to.deep.equal({
        contractAddress: token2Address,
        tokenBalance: '2',
        originalBalance: token2Balance,
      })
    })

    it('should filter out tokens with empty data balance', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = utils.emptyData
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const token2 = { address: token2Address, decimals: 18 }

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(null)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(token2)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs(token2Address).returns(token2Address)

      const handleAlchemyCrazyBalanceStub = sandbox.stub(Alchemy, 'handleAlchemyCrazyBalance')
      handleAlchemyCrazyBalanceStub.withArgs(token2Balance, token2.decimals).returns('2')

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        contractAddress: token2Address,
        tokenBalance: '2',
        originalBalance: token2Balance,
      })
    })

    it('should filter out tokens that are not found', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = '1000000000000000000' // 1 Token
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(null)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(null)

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return contract creation info when found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const txHash = '0xtxhash'
      const blockNumber = 12345

      const contractInfo = [{ txHash }]
      const txReceipt = { blockNumber }

      const fetchContractCreationStub = sandbox
        .stub(EtherscanHelper, 'fetchContractCreation')
        .resolves(contractInfo as any)
      const getTransactionStub = sandbox.stub(Web3Helper, 'getTransaction').resolves(txReceipt)

      // Act
      const result = await Web3Provider.fetchContractCreation({ address, network })

      // Assert
      expect(
        fetchContractCreationStub.calledOnceWith({
          contractAddress: address,
          network,
        }),
      ).to.be.true
      expect(getTransactionStub.calledOnceWith(txHash, network)).to.be.true
      expect(result).to.deep.equal({
        blockNumber,
        transactionHash: txHash,
        address,
      })
    })

    it('should return default values when contract creation info not found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fetchContractCreationStub = sandbox.stub(EtherscanHelper, 'fetchContractCreation').resolves([])

      // Act
      const result = await Web3Provider.fetchContractCreation({ address, network })

      // Assert
      expect(
        fetchContractCreationStub.calledOnceWith({
          contractAddress: address,
          network,
        }),
      ).to.be.true
      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should return BlockScout contract details when available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const contractDetails = { source: 'contract source code' }

      const getContractSourceCodeStub = sandbox
        .stub(BlockScoutHelper, 'getContractSourceCode')
        .resolves(contractDetails as any)
      const fetchContractSourceCodeStub = sandbox.stub(EtherscanHelper, 'fetchContractSourceCode')

      // Act
      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnceWith(address, network)).to.be.true
      expect(fetchContractSourceCodeStub.notCalled).to.be.true
      expect(result).to.equal(contractDetails)
    })

    it('should return Etherscan contract details when BlockScout details not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const contractDetails = { source: 'contract source code from etherscan' }

      const getContractSourceCodeStub = sandbox.stub(BlockScoutHelper, 'getContractSourceCode').resolves(null)
      const fetchContractSourceCodeStub = sandbox
        .stub(EtherscanHelper, 'fetchContractSourceCode')
        .resolves(contractDetails as any)

      // Act
      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnceWith(address, network)).to.be.true
      expect(
        fetchContractSourceCodeStub.calledOnceWith({
          contractAddress: address,
          network,
        }),
      ).to.be.true
      expect(result).to.equal(contractDetails)
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should return BlockScout token details when available', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const tokenDetails = { name: 'Test Token', symbol: 'TT' }

      const getTokenFullDetailsStub = sandbox
        .stub(BlockScoutHelper, 'getTokenFullDetails')
        .resolves(tokenDetails as any)
      const getTokenStub = sandbox.stub(CovalentHelper, 'getToken')

      // Act
      const result = await Web3Provider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(getTokenFullDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenStub.notCalled).to.be.true
      expect(result).to.equal(tokenDetails)
    })

    it('should return Covalent token details when BlockScout details not available', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const tokenDetails = { name: 'Test Token from Covalent', symbol: 'TTC' }

      const getTokenFullDetailsStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)
      const getTokenStub = sandbox.stub(CovalentHelper, 'getToken').resolves(tokenDetails)

      // Act
      const result = await Web3Provider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(getTokenFullDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.equal(tokenDetails)
    })
  })

  describe('fetchTokenHolderAndSupply', () => {
    it('should return Covalent token holders and supply data when available', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const holdersData = { totalHolders: 100, totalSupply: '1000000' }

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(holdersData)
      const getTokenFullDetailsStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails')

      // Act
      const result = await Web3Provider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(getTokenSupplyAndHoldersStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenFullDetailsStub.notCalled).to.be.true
      expect(result).to.deep.equal(holdersData)
    })

    it('should return BlockScout token holders and supply data when Covalent data not available', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockScoutData = {
        totalHolders: 200,
        totalSupply: '2000000',
        otherField: 'value',
      }
      const expectedData = {
        totalHolders: 200,
        totalSupply: '2000000',
      }

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(null as any)
      const getTokenFullDetailsStub = sandbox
        .stub(BlockScoutHelper, 'getTokenFullDetails')
        .resolves(blockScoutData as any as any)

      // Act
      const result = await Web3Provider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(getTokenSupplyAndHoldersStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenFullDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.deep.equal(expectedData)
    })

    it('should return default values when no data available', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      const getTokenSupplyAndHoldersStub = sandbox
        .stub(CovalentHelper, 'getTokenSupplyAndHolders')
        .resolves(null as any)
      const getTokenFullDetailsStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails').resolves(null)

      // Act
      const result = await Web3Provider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(getTokenSupplyAndHoldersStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenFullDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.deep.equal({
        totalHolders: 0,
        totalSupply: '0',
      })
    })
  })

  describe('fetchAddressTxns', async () => {
    it('should call onDocument and create deposit and withdraw transactions', async () => {
      const daoRegistry = {
        address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.ethereumMainnet,
      }

      const txLog: any = {
        hash: '0x123',
        category: ITransactionCategory.ERC20,
        uniqueId: 'unique-id',
        from: '0xfrom',
        to: '0xto',
        value: 1000,
        blockNum: 1,
      }

      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      fakeProviders.send = sandbox.stub().resolves({ transfers: [txLog] })
      sandbox.stub(ProviderModule, 'getProvider').callsFake((network: NetworksEnum) => fakeProviders[network])

      let callCount = 0

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        if (callCount === 0) {
          // First call: deposit
          expect(this.filter.fromAddress).to.be.undefined
          expect(this.filter.toAddress).to.equal(daoRegistry.address)
        } else if (callCount === 1) {
          // Second call: withdraw
          expect(this.filter.toAddress).to.be.undefined
          expect(this.filter.fromAddress).to.equal(daoRegistry.address)
        } else {
          throw new Error('Unexpected crawl call')
        }

        callCount++
        await this.onTx(txLog)
      })

      const response = await Web3Provider.fetchAddressTxns({
        address: daoRegistry.address,
        network: daoRegistry.network,
        blockNumber: 1,
      })

      expect(response).to.be.an('array').with.lengthOf(2)
      expect(response.map((tx: any) => tx.type)).to.include.members(['deposit', 'withdraw'])
      expect(crawlStub.calledTwice).to.be.true
    })
  })

  describe('fetchTokenPrice', () => {
    it('should forward to RateModule.fetchRate', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const pastDays = 7
      const rateData = { current: 10.5, history: [] }

      const fetchRateStub = sandbox.stub(RateModule, 'fetchRate').resolves(rateData as any)

      // Act
      const result = await Web3Provider.fetchTokenPrice({ address, network, pastDays })

      // Assert
      expect(fetchRateStub.calledOnceWith(address, network, pastDays)).to.be.true
      expect(result).to.equal(rateData)
    })
  })

  describe('fetchHistoricalTokenPrice', () => {
    it('should forward to RateModule.fetchHistoricalRate', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const symbol = 'TKN'
      const date = '2023-01-01'
      const historicalRateData = { priceUsd: '15.25' }

      const fetchHistoricalRateStub = sandbox
        .stub(RateModule, 'fetchHistoricalRate')
        .resolves(historicalRateData as any)

      // Act
      const result = await Web3Provider.fetchHistoricalTokenPrice({ address, network, symbol, date })

      // Assert
      expect(
        fetchHistoricalRateStub.calledOnceWith({
          address,
          network,
          symbol,
          timestamp: date,
        }),
      ).to.be.true
      expect(result).to.equal(historicalRateData)
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should forward to BlockScoutHelper.searchDetails', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const searchDetails = { name: 'Contract', type: 'token' }

      const searchDetailsStub = sandbox.stub(BlockScoutHelper, 'searchDetails').resolves(searchDetails as any)

      // Act
      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      // Assert
      expect(searchDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.equal(searchDetails)
    })
  })

  describe('getAllTokenHolders', () => {
    it('should forward to BlockScoutHelper.getAllTokenHolders with correct parameters and trigger callback', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'

      const mockHolders = [
        { address: '0xholder1', value: '100' },
        { address: '0xholder2', value: '200' },
      ]

      const mockResponse = {
        holders: mockHolders,
        total: mockHolders.length,
        hasMore: false,
        lastPage: 1,
      }

      const mockCallback = sinon.stub()

      // Set up stubs
      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const updateProgressStub = sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      // Use callsFake to create a fake implementation that triggers the callback
      const getAllTokenHoldersStub = sandbox
        .stub(BlockScoutHelper, 'getAllTokenHolders')
        .callsFake(async (tokenAddr, net, opts, callback) => {
          // Verify the arguments passed to getAllTokenHolders
          expect(tokenAddr).to.equal(address)
          expect(net).to.equal(network)
          expect(opts.startPage).to.equal(0)

          // Simulate API call processing by triggering callback with sample data
          if (callback) {
            await callback(mockHolders, {
              currentPage: 0,
              isLastPage: true,
              total: mockHolders.length,
            })
          }

          return mockResponse
        })

      // Act
      const result = await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true

      // Verify callback was called for each holder
      expect(mockCallback.callCount).to.equal(mockHolders.length)
      expect(mockCallback.firstCall.args[0]).to.deep.equal(mockHolders[0])
      expect(mockCallback.secondCall.args[0]).to.deep.equal(mockHolders[1])

      // Verify progress was updated
      expect(updateProgressStub.calledOnce).to.be.true
      expect(updateProgressStub.firstCall.args[0]).to.equal(network)
      expect(updateProgressStub.firstCall.args[1]).to.equal(syncKey)
      expect(updateProgressStub.firstCall.args[2]).to.equal(0) // currentPage
      expect(updateProgressStub.firstCall.args[3]).to.equal(true) // isLastPage

      expect(result).to.equal(mockResponse)
    })

    it('should return early when sync is already completed', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const syncProgress = { lastSync: 5, end: true }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(syncProgress)
      const getAllTokenHoldersStub = sandbox.stub(BlockScoutHelper, 'getAllTokenHolders')
      sandbox.stub(logger, 'verbose')
      // Act
      await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.notCalled).to.be.true
    })

    it('should continue from last page when sync was interrupted', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const syncProgress = { lastSync: 3, end: false }
      const mockCallback = sinon.stub()
      const mockResponse = {
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 4,
      }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(syncProgress)
      const getAllTokenHoldersStub = sandbox.stub(BlockScoutHelper, 'getAllTokenHolders').resolves(mockResponse)

      // Act
      const result = await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(getAllTokenHoldersStub.firstCall.args[2].startPage).to.equal(4) // startPage = lastSync + 1
      expect(result).to.equal(mockResponse)
    })

    it('should handle errors gracefully', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const syncKey = 'test-sync-key'
      const error = new Error('API error')

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const getAllTokenHoldersStub = sandbox.stub(BlockScoutHelper, 'getAllTokenHolders').rejects(error)

      // Act
      const result = await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      // Assert
      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('getTokenCounters', () => {
    const address = '0xtoken'
    const network = NetworksEnum.ethereumMainnet

    it('should return Ankr stats when available', async () => {
      const ankrStats = {
        holders: 1000,
        transfers: 500,
      }

      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(ankrStats)
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters')
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders')

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnceWith(address, network)).to.be.true
      expect(blockScoutStub.notCalled).to.be.true
      expect(covalentStub.notCalled).to.be.true
      expect(result).to.deep.equal(ankrStats)
    })

    it('should fallback to BlockScout when Ankr returns null', async () => {
      const blockScoutStats = {
        holders: 800,
        transfers: 300,
      }

      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(null)
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters').resolves(blockScoutStats)
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders')

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnceWith(address, network)).to.be.true
      expect(blockScoutStub.calledOnceWith(address, network)).to.be.true
      expect(covalentStub.notCalled).to.be.true
      expect(result).to.deep.equal(blockScoutStats)
    })

    it('should fallback to Covalent when BlockScout returns zero stats', async () => {
      const blockScoutStats = {
        holders: 0,
        transfers: 0,
      }
      const covalentStats = {
        totalHolders: 600,
        totalSupply: '1000000',
      }
      const expectedResult = {
        holders: 600,
        transfers: 0,
      }

      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(null)
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters').resolves(blockScoutStats)
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentStats)

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnceWith(address, network)).to.be.true
      expect(blockScoutStub.calledOnceWith(address, network)).to.be.true
      expect(covalentStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })

    it('should return default values when all services fail or return zero', async () => {
      const blockScoutStats = {
        holders: 0,
        transfers: 0,
      }
      const covalentStats = {
        totalHolders: 0,
        totalSupply: '0',
      }
      const expectedResult = {
        holders: 0,
        transfers: 0,
      }

      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(null)
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters').resolves(blockScoutStats)
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentStats)

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnceWith(address, network)).to.be.true
      expect(blockScoutStub.calledOnceWith(address, network)).to.be.true
      expect(covalentStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })
  })

  describe('getNetworkBottleneck', () => {
    it('should return node limiter for the network', async () => {
      // Arrange
      const network = NetworksEnum.ethereumMainnet
      const mockLimiter = { submit: () => {}, schedule: () => {} }
      const getNodeLimiterStub = sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      // Act
      const result = Web3Provider.getNetworkBottleneck(network)

      // Assert
      expect(getNodeLimiterStub.calledOnceWith(network)).to.be.true
      expect(result).to.equal(mockLimiter)
    })
  })
})
