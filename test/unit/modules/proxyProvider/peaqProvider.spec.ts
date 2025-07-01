import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, ITransactionCategory, ITransactionType, ITokenType } from '@types'
import logger from '@logger'
import SubscanApi from '@helpers/subscanApi'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import TokenUtils from '@helpers/tokenUtils'
import PeaqProvider from '@modules/proxyProvider/peaqProvider'
import ProxyUtils from '@modules/proxyProvider/utils'
import Logger from '@logger'

describe('PeaqProvider', () => {
  let sandbox: any
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.peaqMainnet
      const tokens = [
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
          tokenBalance: '1000000000000000000',
          decimals: 18,
        },
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd',
          tokenBalance: '2000000000000000000',
          decimals: 18,
        },
      ]

      const getAccountBalanceStub = sandbox.stub(SubscanApi, 'getAccountBalance').resolves(tokens as any)
      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2')

      // Act
      const result = await PeaqProvider.getTokenBalances({ address, network })

      // Assert
      expect(getAccountBalanceStub.calledOnce).to.be.true
      expect(getAccountBalanceStub.firstCall.args[0]).to.equal(address)
      expect(getAccountBalanceStub.firstCall.args[1]).to.equal(network)

      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        tokenBalance: '1.0',
        contractAddress: ethers.getAddress('0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb'),
      })
      expect(result[1]).to.deep.equal({
        tokenBalance: '2.0',
        contractAddress: ethers.getAddress('0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd'),
      })
    })

    it('should handle empty token list', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.peaqMainnet

      const getAccountBalanceStub = sandbox.stub(SubscanApi, 'getAccountBalance').resolves([])

      // Act
      const result = await PeaqProvider.getTokenBalances({ address, network })

      // Assert
      expect(getAccountBalanceStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return contract creation info when found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const contractInfo = {
        blockNumber: 12345,
        transactionHash: '0xtxhash',
        address,
      }

      const fetchContractCreationStub = sandbox.stub(SubscanApi, 'fetchContractCreation').resolves(contractInfo)

      // Act
      const result = await PeaqProvider.fetchContractCreation({ address, network })

      // Assert
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(fetchContractCreationStub.firstCall.args[0]).to.equal(address)
      expect(fetchContractCreationStub.firstCall.args[1]).to.equal(network)
      expect(result).to.equal(contractInfo)
    })

    it('should return default values when contract creation info not found', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet

      const fetchContractCreationStub = sandbox.stub(SubscanApi, 'fetchContractCreation').resolves(null)

      // Act
      const result = await PeaqProvider.fetchContractCreation({ address, network })

      // Assert
      expect(fetchContractCreationStub.calledOnce).to.be.true
      expect(fetchContractCreationStub.firstCall.args[0]).to.equal(address)
      expect(fetchContractCreationStub.firstCall.args[1]).to.equal(network)
      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should forward request to SubscanApi.getContractSourceCode', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = { source: 'contract source code' }

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode as any)

      // Act
      const result = await PeaqProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getContractSourceCodeStub.firstCall.args[0]).to.equal(address)
      expect(getContractSourceCodeStub.firstCall.args[1]).to.equal(network)
      expect(result).to.equal(sourceCode)
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should fetch native token info for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const tokenInfo = { name: 'Native Peaq', symbol: 'PEAQ' }

      const getNativeTokenInfoStub = sandbox.stub(SubscanApi, 'getNativeTokenInfo').resolves(tokenInfo as any)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

      // Act
      const result = await PeaqProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(getNativeTokenInfoStub.calledOnce).to.be.true
      expect(getNativeTokenInfoStub.firstCall.args[0]).to.equal(network)
      expect(getTokenFullDetailsStub.notCalled).to.be.true
      expect(result).to.equal(tokenInfo)
    })

    it('should fetch token details for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const tokenInfo = { name: 'Test Token', symbol: 'TEST' }

      const getNativeTokenInfoStub = sandbox.stub(SubscanApi, 'getNativeTokenInfo')
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(getNativeTokenInfoStub.notCalled).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(address)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)
      expect(result).to.equal(tokenInfo)
    })
  })

  describe('fetchTokenHolderAndSupply', () => {
    it('should extract and return holder and supply data from token info', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const tokenInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        totalHolders: 123,
        totalSupply: '1000000000000000000000',
      }

      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(address)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)
      expect(result).to.deep.equal({
        totalHolders: 123,
        totalSupply: '1000000000000000000000',
      })
    })
  })

  describe('fetchAddressTxns', () => {
    it('should process and filter valid transactions', async () => {
      // Arrange
      const address = '0xaddress'
      const network = NetworksEnum.peaqMainnet

      // Setup transactions
      const tx1 = {
        from: '0xsender',
        to: address,
        value: '1000000000000000000',
        blockNum: 100,
        blockTimestamp: 1622345678,
        hash: '0xtx1',
        category: ITransactionCategory.ERC20,
        uniqueId: 'tx1',
        rawContract: { address: '0xtoken1', decimals: 18 },
      }

      const tx2 = {
        from: address,
        to: '0xreceiver',
        value: '2000000000000000000',
        blockNum: 101,
        blockTimestamp: 1622345700,
        hash: '0xtx2',
        category: ITransactionCategory.ERC20,
        uniqueId: 'tx2',
        rawContract: { address: '0xtoken2', decimals: 18 },
      }

      const tx3 = {
        from: '0xother',
        to: address,
        value: '3',
        blockNum: 102,
        blockTimestamp: 1622345800,
        hash: '0xtx3',
        category: ITransactionCategory.External,
        uniqueId: 'tx3',
        rawContract: { address: utils.zeroAddress },
      }

      const token1 = {
        address: '0xtoken1',
        decimals: 18,
        name: 'Token 1',
        symbol: 'TK1',
        priceUsd: '1.5',
      }

      const token2 = {
        address: '0xtoken2',
        decimals: 18,
        name: 'Token 2',
        symbol: 'TK2',
        priceUsd: '2.5',
      }

      const nativeToken = {
        address: utils.zeroAddress,
        decimals: 18,
        name: 'Native Peaq',
        symbol: 'PEAQ',
        priceUsd: '10.0',
      }

      const getAssetTransferStub = sandbox.stub(SubscanApi, 'getAssetTransfer').resolves([tx1, tx2, tx3] as any)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs('0xtoken1', network).resolves(token1)
      saveAndGetTokenStub.withArgs('0xtoken2', network).resolves(token2)
      saveAndGetTokenStub.withArgs(utils.zeroAddress, network).resolves(nativeToken)

      sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)

      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2')

      // Act
      const result = await PeaqProvider.fetchAddressTxns({ address, network, blockNumber: 21321 })

      // Assert
      expect(getAssetTransferStub.calledOnce).to.be.true
      expect(getAssetTransferStub.firstCall.args[0]).to.equal(address)
      expect(getAssetTransferStub.firstCall.args[1]).to.equal(network)

      expect(result).to.have.lengthOf(3)

      // Check first transaction (deposit)
      expect(result[0]).to.include({
        from: '0xsender',
        to: address,
        blockNum: 100,
        hash: '0xtx1',
        type: ITransactionType.deposit,
      })
      expect(result[0].rawContract).to.include({
        address: '0xtoken1',
        name: 'Token 1',
        symbol: 'TK1',
      })

      // Check second transaction (withdraw)
      expect(result[1]).to.include({
        from: address,
        to: '0xreceiver',
        blockNum: 101,
        hash: '0xtx2',
        type: ITransactionType.withdraw,
      })
      expect(result[1].rawContract).to.include({
        address: '0xtoken2',
        name: 'Token 2',
        symbol: 'TK2',
      })

      // Check third transaction (external/native)
      expect(result[2]).to.include({
        from: '0xother',
        to: address,
        value: '3',
        blockNum: 102,
        hash: '0xtx3',
        type: ITransactionType.deposit,
      })
      expect(result[2].rawContract).to.include({
        address: utils.zeroAddress,
        name: 'Native Peaq',
        symbol: 'PEAQ',
      })
    })

    it('should filter out transactions with native token', async () => {
      // Arrange
      const address = '0xsender'
      const network = NetworksEnum.peaqMainnet

      const tx = {
        from: '0xsender',
        to: address,
        value: '1000000000000000000',
        blockNum: 100,
        blockTimestamp: 1622345678,
        hash: '0xtx1',
        category: ITransactionCategory.External,
        uniqueId: 'tx1',
      }

      const nativeToken = {
        type: ITokenType.native,
        decimals: 18,
        name: 'ETH',
        symbol: 'ETH',
        priceUsd: '0.000001',
      }

      const getAssetTransferStub = sandbox.stub(SubscanApi, 'getAssetTransfer').resolves([tx] as any)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(nativeToken as any)
      const analyzeIfScamTokenStub = sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(false)
      const stubLogger = sandbox.stub(Logger, 'warn')

      // Act
      const result = await PeaqProvider.fetchAddressTxns({ address, network, blockNumber: 12313 })

      // Assert
      expect(getAssetTransferStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(analyzeIfScamTokenStub.notCalled).to.be.true

      expect(result.length).to.eq(0)
      expect(stubLogger.calledOnceWith('Skipping native withdrawal transaction')).to.be.true
    })

    it('should filter out transactions with scam tokens', async () => {
      // Arrange
      const address = '0xaddress'
      const network = NetworksEnum.peaqMainnet

      const tx = {
        from: '0xsender',
        to: address,
        value: '1000000000000000000',
        blockNum: 100,
        blockTimestamp: 1622345678,
        hash: '0xtx1',
        category: ITransactionCategory.ERC20,
        uniqueId: 'tx1',
        rawContract: { address: '0xscamtoken', decimals: 18 },
      }

      const scamToken = {
        address: '0xscamtoken',
        decimals: 18,
        name: 'SCAM Airdrop',
        symbol: 'SCAM',
        priceUsd: '0.000001',
      }

      const getAssetTransferStub = sandbox.stub(SubscanApi, 'getAssetTransfer').resolves([tx] as any)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(scamToken as any)
      const analyzeIfScamTokenStub = sandbox.stub(TokenUtils, 'analyzeIfScamToken').returns(true)

      // Act
      const result = await PeaqProvider.fetchAddressTxns({ address, network, blockNumber: 12313 })

      // Assert
      expect(getAssetTransferStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.firstCall.args[0]).to.equal('0xscamtoken')
      expect(analyzeIfScamTokenStub.calledOnce).to.be.true
      expect(analyzeIfScamTokenStub.firstCall.args[0]).to.equal('SCAM Airdrop')
      expect(analyzeIfScamTokenStub.firstCall.args[1]).to.equal('SCAM')

      expect(result).to.be.an('array').that.is.empty
    })

    it('should skip transactions where token info cannot be found', async () => {
      // Arrange
      const address = '0xaddress'
      const network = NetworksEnum.peaqMainnet

      const tx = {
        from: '0xsender',
        to: address,
        value: '1000000000000000000',
        blockNum: 100,
        blockTimestamp: 1622345678,
        hash: '0xtx1',
        category: ITransactionCategory.ERC20,
        uniqueId: 'tx1',
        rawContract: { address: '0xunknowntoken', decimals: 18 },
      }

      const getAssetTransferStub = sandbox.stub(SubscanApi, 'getAssetTransfer').resolves([tx] as any)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      // Act
      const result = await PeaqProvider.fetchAddressTxns({ address, network, blockNumber: 12313 })

      // Assert
      expect(getAssetTransferStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Token not found')

      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchTokenPrice', () => {
    it('should fetch native token price for zero address', async () => {
      // Arrange
      const token = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const pastDays = 30
      const price = '10.5'

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice').resolves(price)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

      // Act
      const result = await PeaqProvider.fetchTokenPrice({ address: token, network, pastDays })

      // Assert
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(getCurrentPriceStub.firstCall.args[0]).to.equal(network)
      expect(getCurrentPriceStub.firstCall.args[1]).to.equal(pastDays)
      expect(getTokenFullDetailsStub.notCalled).to.be.true

      expect(result).to.deep.equal({
        priceUsd: price,
      })
    })

    it('should handle null price for native token', async () => {
      // Arrange
      const token = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const pastDays = 30

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice').resolves(null as any)

      // Act
      const result = await PeaqProvider.fetchTokenPrice({ address: token, network, pastDays })

      // Assert
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })

    it('should fetch token price for non-zero address', async () => {
      // Arrange
      const token = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const pastDays = 7
      const tokenInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        priceUsd: '2.5',
      }

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice')
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchTokenPrice({ address: token, network, pastDays })

      // Assert
      expect(getCurrentPriceStub.notCalled).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(token)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)

      expect(result).to.deep.equal({
        priceUsd: '2.5',
      })
    })

    it('should handle null price for token', async () => {
      // Arrange
      const token = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const tokenInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        priceUsd: null,
      }

      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchTokenPrice({ address: token, network })

      // Assert
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })
  })

  describe('fetchHistoricalTokenPrice', () => {
    it('should fetch historical native token price for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const date = '2023-01-15'
      const price = '8.75'

      // Mock dayjs calculations
      const dayjs = require('dayjs')
      const utc = require('dayjs/plugin/utc')
      dayjs.extend(utc)

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice').resolves(price)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

      // Act
      const result = await PeaqProvider.fetchHistoricalTokenPrice({ address, network, date })

      // Assert
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(getCurrentPriceStub.firstCall.args[0]).to.equal(network)
      expect(getCurrentPriceStub.firstCall.args[1]).to.be.a('number')
      expect(getTokenFullDetailsStub.notCalled).to.be.true

      expect(result).to.be.equal(price)
    })

    it('should use default 30 days when no date provided for native token', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const price = '12.50'

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice').resolves(price)

      // Act
      const result = await PeaqProvider.fetchHistoricalTokenPrice({ address, network })

      // Assert
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(getCurrentPriceStub.firstCall.args[0]).to.equal(network)
      expect(getCurrentPriceStub.firstCall.args[1]).to.equal(30)

      expect(result).to.be.equal(price)
    })

    it('should handle null price for historical native token', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.peaqMainnet
      const date = '2023-01-01'

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice').resolves(null as any)

      // Act
      const result = await PeaqProvider.fetchHistoricalTokenPrice({ address, network, date })

      // Assert
      expect(getCurrentPriceStub.calledOnce).to.be.true
      expect(result).to.be.equal('0')
    })

    it('should fetch token details for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const date = '2023-01-01'
      const tokenInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        priceUsd: '5.25',
      }

      const getCurrentPriceStub = sandbox.stub(SubscanApi, 'getCurrentPrice')
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchHistoricalTokenPrice({ address, network, date })

      // Assert
      expect(getCurrentPriceStub.notCalled).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(address)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)

      expect(result).to.deep.equal('5.25')
    })

    it('should handle null price for historical token', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const tokenInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        priceUsd: null,
      }

      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenInfo as any)

      // Act
      const result = await PeaqProvider.fetchHistoricalTokenPrice({ address, network })

      // Assert
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(result).to.be.equal('0')
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return details from contract source code when available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode as any)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails')

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getContractSourceCodeStub.firstCall.args[0]).to.equal(address)
      expect(getContractSourceCodeStub.firstCall.args[1]).to.equal(network)
      expect(getTokenFullDetailsStub.notCalled).to.be.true

      expect(result).to.deep.equal({
        name: 'TestContract',
      })
    })

    it('should fallback to token details when source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet
      const sourceCode = [] // Empty array (no source code)
      const tokenDetails = {
        name: 'Test Token',
        symbol: 'TEST',
      }

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(sourceCode)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(tokenDetails as any)

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.firstCall.args[0]).to.equal(address)
      expect(getTokenFullDetailsStub.firstCall.args[1]).to.equal(network)

      expect(result).to.deep.equal({
        name: 'Test Token',
        type: 'token',
      })
    })

    it('should handle null values in contract name', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.peaqMainnet

      const getContractSourceCodeStub = sandbox.stub(SubscanApi, 'getContractSourceCode').resolves(null as any)
      const getTokenFullDetailsStub = sandbox.stub(SubscanApi, 'getTokenFullDetails').resolves(null as any)

      // Act
      const result = await PeaqProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(getContractSourceCodeStub.calledOnce).to.be.true
      expect(getTokenFullDetailsStub.calledOnce).to.be.true

      expect(result).to.deep.equal({
        name: null,
        type: ITokenType.unknown,
      })
    })
  })

  describe('getAllTokenHolders', () => {
    it('should forward to SubscanApi.getAllTokenHolders with correct parameters and trigger callback', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const syncKey = 'test-sync-key'

      const mockHolders = [
        { address: '0xholder1', value: '100' },
        { address: '0xholder2', value: '200' },
      ]

      const mockResponse = {
        holders: mockHolders,
        total: mockHolders.length,
        hasMore: true,
        lastPage: 1,
      }

      const mockCallback = sinon.stub()

      // Set up stubs
      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const updateProgressStub = sandbox.stub(ProxyUtils, 'updateProgressInConfigIndexer').resolves()

      let capturedCallback: Function | undefined
      const getAllTokenHoldersStub = sandbox
        .stub(SubscanApi, 'getAllTokenHolders')
        .callsFake(async (tokenAddr, net, opts, callback) => {
          capturedCallback = callback

          if (callback && typeof callback === 'function') {
            await callback(mockHolders, {
              currentPage: 0,
              isLastPage: true,
              total: mockHolders.length,
            })
          }

          return mockResponse
        })

      // Act
      const result = await PeaqProvider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
        syncKey,
      })

      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(getAllTokenHoldersStub.firstCall.args[0]).to.equal(address)
      expect(getAllTokenHoldersStub.firstCall.args[1]).to.equal(network)

      expect(capturedCallback).to.be.a('function')

      expect(mockCallback.callCount).to.be.eq(2)
      expect(mockCallback.firstCall.args[0]).to.deep.equal(mockHolders[0])

      expect(result).to.deep.equal(mockResponse)
      expect(updateProgressStub.calledOnce).to.be.true
      expect(updateProgressStub.args[0][0]).to.equal(network)
      expect(updateProgressStub.args[0][1]).to.equal(syncKey)
      expect(updateProgressStub.args[0][2]).to.equal(0)
      expect(updateProgressStub.args[0][3]).to.equal(true)
    })

    it('should return early when sync is already completed', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const syncKey = 'test-sync-key'
      const syncProgress = { lastSync: 5, end: true }

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(syncProgress)
      const getAllTokenHoldersStub = sandbox.stub(SubscanApi, 'getAllTokenHolders')

      await PeaqProvider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.called).to.be.false
    })

    it('should continue from last page when sync was interrupted', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
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
      const getAllTokenHoldersStub = sandbox.stub(SubscanApi, 'getAllTokenHolders').resolves(mockResponse)

      // Act
      const result = await PeaqProvider.getAllTokenHolders({
        address,
        network,
        callback: mockCallback,
        syncKey,
      })

      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(getAllTokenHoldersStub.firstCall.args[2].startPage).to.equal(4)
      expect(result).to.equal(mockResponse)
    })

    it('should handle errors gracefully', async () => {
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const syncKey = 'test-sync-key'
      const error = new Error('API error')

      const getProgressStub = sandbox.stub(ProxyUtils, 'getProgressFromConfigIndexer').resolves(null)
      const getAllTokenHoldersStub = sandbox.stub(SubscanApi, 'getAllTokenHolders').rejects(error)

      const result = await PeaqProvider.getAllTokenHolders({
        address,
        network,
        callback: () => {},
        syncKey,
      })

      expect(getProgressStub.calledOnceWith(network, syncKey)).to.be.true
      expect(getAllTokenHoldersStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('getTokenCounters', () => {
    it('should return token counters from SubscanApi', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.peaqMainnet
      const counters = {
        holders: 100,
        transfers: 200,
      }

      const getTokenCountersStub = sandbox.stub(SubscanApi, 'getTokenCounters').resolves(counters as any)
      const result = await PeaqProvider.getTokenCounters({ address, network })

      // Assert
      expect(getTokenCountersStub.calledOnce).to.be.true
      expect(getTokenCountersStub.firstCall.args[0]).to.equal(address)
      expect(getTokenCountersStub.firstCall.args[1]).to.equal(network)

      expect(result).to.deep.equal(counters)
    })
  })
})
