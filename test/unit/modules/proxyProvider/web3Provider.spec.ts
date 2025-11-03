import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum } from '@types'
import logger from '@logger'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import BlockScoutHelper from '@helpers/blockScout'
import CovalentHelper from '@helpers/covalent'
import utils from '@helpers/utils'
import Alchemy from '@helpers/alchemy'
import Web3Utils from '@helpers/web3Utils'
import { RateModule } from '@modules/rates'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import AnkrHelper from '@helpers/ankrHelper'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

describe('Web3Provider', () => {
  let sandbox: any
  let loggerStub: any
  let loggerWarnStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
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
    it('should return contract creation data using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
      expect(typeof fallbackArgs[1]).to.equal('function')
      expect(typeof fallbackArgs[2]).to.equal('object')
    })

    it('should return default values when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.fetchContractCreation({ address, network })

      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })

    it('should call evmExplorerClient.fetchContractCreation in fallback function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const mockResult = {
        blockNumber: 123,
        transactionHash: '0xabc123',
        address,
      }

      const evmExplorerStub = sandbox.stub(evmExplorerClient, 'fetchContractCreation').resolves(mockResult)
      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, _options) => {
        // Call the function with the first explorer to test it
        return await fn(explorers[0])
      })

      await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(evmExplorerStub.calledOnceWith(EvmExplorerEnum.BLOCKSCOUT, address, network)).to.be.true
    })

    it('should validate result has transaction hash in validation function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(null)

      await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true

      const validationOptions = fallbackCallStub.firstCall.args[2]
      expect(typeof validationOptions?.validate).to.equal('function')

      // Test validation function
      if (validationOptions?.validate) {
        expect(validationOptions.validate(null)).to.be.false
        expect(validationOptions.validate({})).to.be.false
        expect(validationOptions.validate({ transactionHash: null })).to.be.false
        expect(validationOptions.validate({ transactionHash: '0xabc123' })).to.be.true
      }
    })

    it('should pass zkSync in case of zkSync network', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      // Act
      const result = await Web3Provider.fetchContractCreation({ address, network })

      // Assert
      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when explorer fails in onError callback', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      // Reset the logger stub call history
      loggerWarnStub.resetHistory()

      sandbox.stub(utils, 'fallbackCall').callsFake(async (_explorers, _fn, options) => {
        // Call the onError callback to trigger the warning
        if (options?.onError) {
          const error = new Error('Explorer API failed')
          options.onError(error, EvmExplorerEnum.ETHERSCAN, 0)
        }
        return null
      })

      await Web3Provider.fetchContractCreation({ address, network })

      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Failed to fetch contract creation from etherscan' as any)).to.be.true
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should return contract source code using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ROUTESCAN,
      ])
      expect(typeof fallbackArgs[1]).to.equal('function')
      expect(typeof fallbackArgs[2]).to.equal('object')
    })

    it('should return null when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(result).to.be.null
    })

    it('should call evmExplorerClient.fetchContractSourceCode in fallback function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const mockResult = [
        {
          SourceCode: 'pragma solidity ^0.8.0; contract Test {}',
          ContractName: 'TestContract',
          ABI: '[{"type":"constructor"}]',
        },
      ]

      const evmExplorerStub = sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(mockResult)
      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, _options) => {
        // Call the function with the first explorer to test it
        return await fn(explorers[0])
      })

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(evmExplorerStub.calledOnceWith(EvmExplorerEnum.ETHERSCAN, address, network)).to.be.true
    })

    it('should validate result exists in validation function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(null)

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true

      const validationOptions = fallbackCallStub.firstCall.args[2]
      expect(typeof validationOptions?.validate).to.equal('function')

      // Test validation function
      if (validationOptions?.validate) {
        expect(validationOptions.validate(null)).to.be.false
        expect(validationOptions.validate(undefined)).to.be.false
        expect(validationOptions.validate([])).to.be.true
        expect(validationOptions.validate([{ SourceCode: 'contract code' }])).to.be.true
      }
    })

    it('should pass zkSync in case of zkSync network', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      // Act
      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      // Assert
      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when explorer fails in onError callback', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      // Reset the logger stub call history
      loggerWarnStub.resetHistory()

      sandbox.stub(utils, 'fallbackCall').callsFake(async (_explorers, _fn, options) => {
        // Call the onError callback to trigger the warning
        if (options?.onError) {
          const error = new Error('Source code API failed')
          options.onError(error, EvmExplorerEnum.BLOCKSCOUT, 1)
        }
        return null
      })

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Failed to fetch contract source code from blockscout' as any)).to.be.true
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

    it('should call Covalent directly for zero address', async () => {
      const address = utils.zeroAddress
      const network = NetworksEnum.ethereumMainnet
      const tokenDetails = { name: 'Native Token', symbol: 'ETH' }

      const getTokenStub = sandbox.stub(CovalentHelper, 'getToken').resolves(tokenDetails)
      const getTokenFullDetailsStub = sandbox.stub(BlockScoutHelper, 'getTokenFullDetails')

      // Act
      const result = await Web3Provider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(getTokenStub.calledOnceWith(address, network)).to.be.true
      expect(getTokenFullDetailsStub.notCalled).to.be.true
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

    it('should fall back to default values when all sources have zero values', async () => {
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      // Ankr returns null
      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(null)

      const blockScoutStats = { holders: 0, transfers: 0 }
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters').resolves(blockScoutStats)

      const covalentStats = { totalHolders: 0, totalSupply: '0' }
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentStats)

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnce).to.be.true
      expect(blockScoutStub.calledOnce).to.be.true
      expect(covalentStub.calledOnce).to.be.true
      expect(result).to.deep.equal({ holders: 0, transfers: 0 })
    })

    it('should handle when BlockScout is unavailable but Covalent has data', async () => {
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      // Ankr returns null
      const ankrStub = sandbox.stub(AnkrHelper, 'getTokenHoldersCount').resolves(null)

      // BlockScout returns zeros (blockScoutAvailable = false)
      const blockScoutStats = { holders: 0, transfers: 0 }
      const blockScoutStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters').resolves(blockScoutStats)

      // Covalent has valid data (covalentAvailable = true)
      const covalentStats = { totalHolders: 100, totalSupply: '1000000' }
      const covalentStub = sandbox.stub(CovalentHelper, 'getTokenSupplyAndHolders').resolves(covalentStats)

      const result = await Web3Provider.getTokenCounters({ address, network })

      expect(ankrStub.calledOnce).to.be.true
      expect(blockScoutStub.calledOnce).to.be.true
      expect(covalentStub.calledOnce).to.be.true
      expect(result).to.deep.equal({ holders: 100, transfers: 0 })
    })
  })

  describe('fetchHistoricalTokenPrice', () => {
    it('should call RateModule.fetchHistoricalRate with correct parameters', async () => {
      const symbol = 'ETH'
      const address = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const date = 1234567890
      const expectedResult = { price: 100, timestamp: date }

      const fetchHistoricalRateStub = sandbox.stub(RateModule, 'fetchHistoricalRate').resolves(expectedResult)

      const result = await Web3Provider.fetchHistoricalTokenPrice({ symbol, address, network, date })

      expect(
        fetchHistoricalRateStub.calledOnceWith({
          address,
          network,
          symbol,
          timestamp: date,
        }),
      ).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should call BlockScoutHelper.searchDetails', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const expectedResult = { name: 'Contract', type: 'token' }

      const searchDetailsStub = sandbox.stub(BlockScoutHelper, 'searchDetails').resolves(expectedResult)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(searchDetailsStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })
  })

  describe('fetchContractSourceCode edge case', () => {
    it('should handle zkSync Sepolia network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncSepolia
      const expectedResult = [{ SourceCode: 'code', ContractName: 'Test', ABI: '[]' }]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })
  })

  describe('fetchContractCreation edge case', () => {
    it('should handle zkSync Sepolia network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncSepolia
      const expectedResult = { blockNumber: 100, transactionHash: '0xtx', address }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.BLOCKSCOUT,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })
  })
})
