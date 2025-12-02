import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum } from '@types'
import logger from '@logger'
import { ethers } from 'ethers'
import utils from '@helpers/utils'
import ChilizProvider from '@modules/proxyProvider/chilizProvider'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import { IBlockScoutAddressType } from '@src/types/blockScout'

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

  describe('searchDetailsOfContract', () => {
    it('should return contract name from source code', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      const fetchContractSourceCodeStub = sandbox
        .stub(ChilizProvider, 'fetchContractSourceCode')
        .resolves(sourceCode as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: IBlockScoutAddressType.ADDRESS,
        name: 'TestContract',
      })
    })

    it('should return null name when contract source code is not available', async () => {
      // Arrange
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      const fetchContractSourceCodeStub = sandbox.stub(ChilizProvider, 'fetchContractSourceCode').resolves(null as any)

      // Act
      const result = await ChilizProvider.searchDetailsOfContract({ address, network })

      // Assert
      expect(fetchContractSourceCodeStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: IBlockScoutAddressType.ADDRESS,
        name: null,
      })
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
