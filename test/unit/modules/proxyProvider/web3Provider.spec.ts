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

      const crawlStub = sandbox.stub(BlockchainTransferCrawler.prototype, 'crawl').callsFake(async function (
        this: any,
      ) {
        await this.onTx(txLog)
      })

      const response = await Web3Provider.fetchAddressTxns({
        address: daoRegistry.address,
        network: daoRegistry.network,
        blockNumber: 1,
      })

      expect(response).to.be.an('array').that.have.lengthOf(2)
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
    it('should forward to BlockScoutHelper.getAllTokenHolders with correct parameters', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const mockCallback = sandbox.stub()
      const mockHolders = [
        { address: '0xholder1', value: '100' },
        { address: '0xholder2', value: '200' },
      ]
      const mockResponse = {
        holders: mockHolders,
        total: mockHolders.length,
        hasMore: false,
      }

      const getAllTokenHoldersStub = sandbox.stub(BlockScoutHelper, 'getAllTokenHolders').resolves(mockResponse)

      // Act
      const result = await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
      })

      // Assert
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(
        getAllTokenHoldersStub.calledWith(
          address,
          network,
          { pageSize: 100, maxPages: 1000, delayMs: 500 },
          mockCallback,
        ),
      ).to.be.true
      expect(result).to.equal(mockResponse)
    })

    it('should handle callbacks for each token holder', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const mockCallback = sandbox.stub()
      const mockHolders = [
        { address: '0xholder1', value: '100' },
        { address: '0xholder2', value: '200' },
      ]

      // Simulate the behavior where BlockScoutHelper calls callback for each holder
      const getAllTokenHoldersStub = sandbox
        .stub(BlockScoutHelper, 'getAllTokenHolders')
        .callsFake(async (_address, _network, _options, callback) => {
          if (callback) {
            for (const holder of mockHolders) {
              await callback(holder)
            }
          }
          return {
            holders: mockHolders,
            total: mockHolders.length,
            hasMore: false,
          }
        })

      const result = await Web3Provider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
      })
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(mockCallback.calledTwice).to.be.true
      expect(mockCallback.firstCall.args[0]).to.deep.equal(mockHolders[0])
      expect(mockCallback.secondCall.args[0]).to.deep.equal(mockHolders[1])
      expect(result.holders).to.deep.equal(mockHolders)
    })

    it('should handle errors from BlockScoutHelper', async () => {
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const errorMessage = 'BlockScout API error'

      const getAllTokenHoldersStub = sandbox
        .stub(BlockScoutHelper, 'getAllTokenHolders')
        .rejects(new Error(errorMessage))

      try {
        await Web3Provider.getAllTokenHolders({ address, network, callback: () => {} })
        expect.fail('Expected an error to be thrown')
      } catch (error: any) {
        expect(error.message).to.equal(errorMessage)
        expect(getAllTokenHoldersStub.calledOnce).to.be.true
      }
    })
  })
})
