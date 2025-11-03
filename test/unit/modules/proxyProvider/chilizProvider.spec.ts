import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, ITokenType } from '@types'
import logger from '@logger'
import { ethers } from 'ethers'
import utils from '@helpers/utils'
import ChilizProvider from '@modules/proxyProvider/chilizProvider'
import RouteScanHelper from '@helpers/routeScanHelper'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

describe('ChilizProvider', () => {
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

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: [
          {
            contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
            balance: '1000000000000000000',
            decimals: '18',
          },
          {
            contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fd',
            balance: '2000000000000000000',
            decimals: '18',
          },
        ],
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)
      const formatUnitsStub = sandbox.stub(ethers, 'formatUnits')
      formatUnitsStub.withArgs('1000000000000000000', 18).returns('1')
      formatUnitsStub.withArgs('2000000000000000000', 18).returns('2')

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.equal('api')
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'account',
        action: 'tokenlist',
        address,
      })
      expect(rpcCallStub.firstCall.args[2]).to.equal(network)

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

    it('should return empty array when API call fails', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })

    it('should return empty array when response message is not OK', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const mockResponse = { message: 'NOTOK', result: [] }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.getTokenBalances({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return contract creation data using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await ChilizProvider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.CHILIZ, EvmExplorerEnum.ROUTESCAN])
      expect(typeof fallbackArgs[1]).to.equal('function')
      expect(typeof fallbackArgs[2]).to.equal('object')
    })

    it('should return default values when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await ChilizProvider.fetchContractCreation({ address, network })

      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })

    it('should call evmExplorerClient.fetchContractCreation in fallback function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
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

      await ChilizProvider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(evmExplorerStub.calledOnceWith(EvmExplorerEnum.CHILIZ, address, network)).to.be.true
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should return contract source code using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await ChilizProvider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.CHILIZ, EvmExplorerEnum.ROUTESCAN])
      expect(typeof fallbackArgs[1]).to.equal('function')
      expect(typeof fallbackArgs[2]).to.equal('object')
    })

    it('should return null when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await ChilizProvider.fetchContractSourceCode({ address, network })

      expect(result).to.be.null
    })

    it('should call evmExplorerClient.fetchContractSourceCode in fallback function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
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

      await ChilizProvider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(evmExplorerStub.calledOnceWith(EvmExplorerEnum.CHILIZ, address, network)).to.be.true
    })

    it('should validate result has source code in validation function', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(null)

      await ChilizProvider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true

      const validationOptions = fallbackCallStub.firstCall.args[2]
      expect(typeof validationOptions?.validate).to.equal('function')

      // Test validation function
      if (validationOptions?.validate) {
        expect(validationOptions.validate(null)).to.be.false
        expect(validationOptions.validate([])).to.be.false
        expect(validationOptions.validate([{ SourceCode: '' }])).to.be.false
        expect(validationOptions.validate([{ SourceCode: 'contract code' }])).to.be.true
      }
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should fetch native token info for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet
      const mockPriceResponse = {
        message: 'OK',
        result: { coin_usd: '0.15' },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockPriceResponse)

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'stats',
        action: 'coinprice',
      })

      expect(result).to.include({
        address,
        name: 'Chiliz',
        symbol: 'CHZ',
        decimals: 18,
        type: ITokenType.native,
        priceUsd: '0.15',
      })
    })

    it('should handle price fetch failure for native token', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('Price API Error'))

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.include({
        address,
        name: 'Chiliz',
        symbol: 'CHZ',
        decimals: 18,
        type: ITokenType.native,
        priceUsd: '0',
      })
    })

    it('should fetch token details for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockTokenResponse = {
        message: 'OK',
        result: {
          name: 'Test Token',
          symbol: 'TEST',
          decimals: 18,
          type: 'ERC-20',
          totalSupply: '1000000',
        },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockTokenResponse)

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[1]).to.deep.equal({
        module: 'token',
        action: 'getToken',
        contractaddress: address,
      })

      expect(result).to.include({
        address,
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        type: ITokenType.ERC20,
        totalSupply: '1000000',
      })
    })

    it('should handle API failure for token info', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })
      expect(rpcCallStub.calledOnce).to.be.true

      // Assert
      expect(result).to.include({
        address,
        name: null,
        symbol: null,
        decimals: 0,
        type: ITokenType.unknown,
      })
    })

    it('should use || operators for null/undefined token result fields', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockTokenResponse = {
        message: 'OK',
        result: {
          name: null, // Line 148: tokenResponse.result.name || null
          symbol: undefined, // Line 149: tokenResponse.result.symbol || null
          decimals: null, // Line 150: tokenResponse.result.decimals || 0
          type: undefined, // Lines 151-156: various type checks with fallback to ITokenType.unknown
          totalSupply: null, // Line 157: tokenResponse.result.totalSupply || '0'
        },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockTokenResponse)

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.deep.include({
        address,
        name: null, // Line 148: null || null = null
        symbol: null, // Line 149: undefined || null = null
        decimals: 0, // Line 150: null || 0 = 0
        type: ITokenType.unknown, // Lines 151-156: undefined type -> ITokenType.unknown
        totalSupply: '0', // Line 157: null || '0' = '0'
        totalHolders: '0', // Line 158: always '0' in this code
      })
    })

    it('should handle ERC-721 type detection with || operator', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const mockTokenResponse = {
        message: 'OK',
        result: {
          name: 'NFT Token',
          symbol: 'NFT',
          decimals: 0,
          type: 'ERC-721', // Test ERC-721 detection
          totalSupply: '10000',
        },
      }

      // Act
      const result = await ChilizProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(result.type).to.equal(ITokenType.ERC721) // Lines 154-155
    })
  })

  describe('fetchTokenHolderAndSupply', () => {
    it('should extract and return holder and supply data from token info', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves({
        totalHolders: '123',
        totalSupply: '1000000000000000000000',
      } as any)

      // Act
      const result = await ChilizProvider.fetchTokenHolderAndSupply({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(fetchBasicTokenInfoStub.firstCall.args[0]).to.deep.equal({ address, network })

      expect(result).to.deep.equal({
        totalHolders: '123',
        totalSupply: '1000000000000000000000',
      })
    })
  })

  describe('fetchTokenPrice', () => {
    it('should fetch native token price for zero address', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet
      const mockResponse = {
        message: 'OK',
        result: { coin_usd: '0.15' },
      }

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').resolves(mockResponse)

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0.15',
      })
    })

    it('should return default price when native price fetch fails', async () => {
      // Arrange
      const address = utils.zeroAddress
      const network = NetworksEnum.chilizMainnet

      const rpcCallStub = sandbox.stub(ChilizProvider, '_rpcCall').rejects(new Error('API Error'))

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(rpcCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })

    it('should return default price for non-zero address', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      // Act
      const result = await ChilizProvider.fetchTokenPrice({ address, network })

      // Assert
      expect(result).to.deep.equal({
        priceUsd: '0',
      })
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return token details when token type is known', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = {
        name: 'Test Token',
        type: ITokenType.ERC20,
      }

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'token',
        name: 'Test Token',
      })
    })

    it('should fallback to contract source code when token type is unknown', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = { type: ITokenType.unknown }
      const contractInfo = [{ ContractName: 'TestContract' }]

      const fetchBasicTokenInfoStub = sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)
      const fetchContractSourceCodeStub = sandbox
        .stub(ChilizProvider, 'fetchContractSourceCode')
        .resolves(contractInfo as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchBasicTokenInfoStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'address',
        name: 'TestContract',
      })
    })

    it('should handle case when contract source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const tokenInfo = { type: ITokenType.unknown }

      sandbox.stub(ChilizProvider, 'fetchBasicTokenInfo').resolves(tokenInfo as any)
      sandbox.stub(ChilizProvider, 'fetchContractSourceCode').resolves(null)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(result).to.deep.equal({
        type: 'address',
        name: null,
      })
    })
  })

  describe('getTokenCounters', () => {
    it('should return token counters using routescan', async () => {
      // Arrange
      const address = '0xtoken'
      const network = NetworksEnum.chilizMainnet

      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchTokenHoldersCount').resolves(10)

      // Act
      const result = await ChilizProvider.getTokenCounters({ address, network })

      // Assert
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.deep.eq({
        network,
        address,
      })

      expect(result).to.deep.equal({
        transfers: 0,
        holders: 10,
      })
    })
  })

  describe('_rpcCall', () => {
    let axiosStub: any
    let bottleneckStub: any
    let retryRequestStub: any

    beforeEach(() => {
      axiosStub = sandbox.stub()
      bottleneckStub = {
        schedule: sandbox.stub().callsFake(async (fn: Function) => fn()),
      }
      retryRequestStub = sandbox.stub().callsFake(async (fn: Function) => fn())

      // Mock the modules
      sandbox.stub(require('axios'), 'get').callsFake(axiosStub)
      sandbox.stub(require('@helpers/retryRequest'), 'retryRequest').callsFake(retryRequestStub)
      sandbox.stub(require('@modules/bottleneck'), 'default').value({
        getChilizLimiter: sandbox.stub().returns(bottleneckStub),
      })
    })

    it('should make successful API call', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'balance', address: '0x123' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: '1000000000000000000' }

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(retryRequestStub.calledOnce).to.be.true
      expect(bottleneckStub.schedule.calledOnce).to.be.true
      expect(axiosStub.calledOnce).to.be.true
      expect(axiosStub.firstCall.args[0]).to.equal('https://scan.chiliz.com/api')
      expect(axiosStub.firstCall.args[1]).to.deep.equal({ params })
      expect(result).to.deep.equal(mockResponseData)
    })

    it('should handle axios errors', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'balance' }
      const network = NetworksEnum.chilizMainnet
      const error = new Error('Network Error')

      axiosStub.rejects(error)

      // Act & Assert
      try {
        await ChilizProvider._rpcCall(path, params, network)
        expect.fail('Should have thrown an error')
      } catch (thrownError) {
        expect(thrownError).to.equal(error)
      }
    })

    it('should construct correct URL for different paths', async () => {
      // Arrange
      const path = 'token-counters'
      const params = { id: '0xtoken' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { token_holder_count: 100 }

      axiosStub.resolves({ data: mockResponseData })

      // Act
      await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(axiosStub.firstCall.args[0]).to.equal('https://scan.chiliz.com/token-counters')
    })

    it('should handle bottleneck rate limiting', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'stats', action: 'coinprice' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: { coin_usd: '0.15' } }

      let scheduledFunction: Function
      bottleneckStub.schedule.callsFake((fn: Function) => {
        scheduledFunction = fn
        return fn()
      })

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(bottleneckStub.schedule.calledOnce).to.be.true
      expect(typeof scheduledFunction!).to.equal('function')
      expect(result).to.deep.equal(mockResponseData)
    })

    it('should handle retry mechanism', async () => {
      // Arrange
      const path = 'api'
      const params = { module: 'account', action: 'tokenlist' }
      const network = NetworksEnum.chilizMainnet
      const mockResponseData = { message: 'OK', result: [] }

      let retryFunction: Function
      retryRequestStub.callsFake((fn: Function) => {
        retryFunction = fn
        return fn()
      })

      axiosStub.resolves({ data: mockResponseData })

      // Act
      const result = await ChilizProvider._rpcCall(path, params, network)

      // Assert
      expect(retryRequestStub.calledOnce).to.be.true
      expect(typeof retryFunction!).to.equal('function')
      expect(result).to.deep.equal(mockResponseData)
    })
  })

  describe('fetchHistoricalTokenPrice', () => {
    it('should return 0 for historical token price', async () => {
      // fetchHistoricalTokenPrice accepts any arguments but doesn't use them
      const result = await ChilizProvider.fetchHistoricalTokenPrice({
        address: '0x123',
        network: NetworksEnum.chilizMainnet,
      } as any)
      expect(result).to.equal('0')
    })
  })

  describe('fetchContractCreation - validation and error handling', () => {
    it('should validate contract creation result and handle errors', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      let validationFn: any
      let errorHandler: any

      sandbox.stub(utils, 'fallbackCall').callsFake((_explorers, _fn, options) => {
        validationFn = options.validate
        errorHandler = options.onError
        return null
      })

      await ChilizProvider.fetchContractCreation({ address, network })

      expect(validationFn(null)).to.be.false
      expect(validationFn({ transactionHash: null })).to.be.false
      expect(validationFn({ transactionHash: '0xabc' })).to.be.true

      // Test error handler - covers lines 67-68
      const mockError = new Error('Test error')
      errorHandler(mockError, EvmExplorerEnum.CHILIZ, 0)

      // Verify logger was called (check that it was called, not the exact message)
      expect(loggerWarnStub.called).to.be.true
    })
  })

  describe('fetchContractSourceCode - error logging', () => {
    it('should log errors when fetching contract source code fails', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      let errorHandler: any

      sandbox.stub(utils, 'fallbackCall').callsFake((_explorers, _fn, options) => {
        errorHandler = options.onError
        return null
      })

      await ChilizProvider.fetchContractSourceCode({ address, network })

      const mockError = new Error('Source code fetch failed')
      errorHandler(mockError, EvmExplorerEnum.ROUTESCAN, 1)

      // Verify logger was called
      expect(loggerWarnStub.called).to.be.true
    })
  })
})
