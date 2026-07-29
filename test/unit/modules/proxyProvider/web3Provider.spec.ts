import Alchemy from '@helpers/alchemy'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

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
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN])
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

    it('should pass zkSync in case of zkSync network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
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
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should use only Blockscout for Citrea networks', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.citreaMainnet
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
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.BLOCKSCOUT])
    })

    it('should log warning when onError callback is triggered', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        options.onError(new Error('Test error'), EvmExplorerEnum.ZKSYNC, 0)
        return { blockNumber: 100, transactionHash: '0xtxhash', address }
      })

      await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.firstCall.args[0]).to.include('Failed to fetch contract creation')
    })

    it('should validate result with transactionHash', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        const validResult = options.validate({ transactionHash: '0xtx' })
        const invalidResult = options.validate({ transactionHash: null })
        expect(validResult).to.be.true
        expect(invalidResult).to.be.false
        return { blockNumber: 100, transactionHash: '0xtxhash', address }
      })

      await Web3Provider.fetchContractCreation({ address, network })
      expect(fallbackCallStub.calledOnce).to.be.true
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
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN])
    })

    it('should return null when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(result).to.be.null
    })

    it('should pass zkSync in case of zkSync network', async () => {
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

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when onError callback is triggered', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        options.onError(new Error('Test error'), EvmExplorerEnum.ETHERSCAN, 0)
        return [{ SourceCode: 'code', ContractName: 'Test', ABI: '[]' }]
      })

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.firstCall.args[0]).to.include('Failed to fetch contract source code')
    })

    it('should validate result presence', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        const validResult = options.validate([{ SourceCode: 'code' }])
        const invalidResult = options.validate(null)
        expect(validResult).to.be.true
        expect(invalidResult).to.be.false
        return [{ SourceCode: 'code', ContractName: 'Test', ABI: '[]' }]
      })

      await Web3Provider.fetchContractSourceCode({ address, network })
      expect(fallbackCallStub.calledOnce).to.be.true
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return contract name when source code is found', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (_explorers, fn, _options) => {
        // Call the inner function to cover it
        await fn(EvmExplorerEnum.ETHERSCAN)
        return sourceCode
      })
      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(sourceCode as any)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'address',
        name: 'TestContract',
      })

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN])
    })

    it('should return null name when source code is not found', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: 'address',
        name: null,
      })
    })

    it('should return null name when source code is empty array', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves([])

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: 'address',
        name: null,
      })
    })

    it('should pass zkSync in case of zkSync network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(sourceCode)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        type: 'address',
        name: 'TestContract',
      })

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when onError callback is triggered', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        // Call both the inner function and onError to cover them
        await fn(EvmExplorerEnum.ETHERSCAN)
        options.onError(new Error('Test error'), EvmExplorerEnum.ETHERSCAN, 0)
        return [{ ContractName: 'TestContract' }]
      })
      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves([{ ContractName: 'TestContract' }] as any)

      await Web3Provider.searchDetailsOfContract({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.firstCall.args[0]).to.include('Failed to fetch contract source code')
    })
  })
})
