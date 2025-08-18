import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import { NetworksEnum } from '@types'
import axios from 'axios'
import logger from '@logger'
import config from '@config'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'
import { ethers } from 'ethers'
import * as retryRequestModule from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

describe('Helpers: EvmExplorerClient', () => {
  let sandbox: SinonSandbox
  let loggerStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
    // Stub retryRequest to execute immediately without retries
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    // Stub BottleneckModule to execute immediately without rate limiting
    sandbox.stub(BottleneckModule, 'getEtherScanLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchContractSourceCode', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch contract source code from Etherscan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'pragma solidity ^0.8.0; contract Test {}',
              ContractName: 'TestContract',
              ABI: '[{"type":"constructor"}]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(getChainIdStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://api.etherscan.io/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
        apikey: 'test-api-key',
        chainid: 1,
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'pragma solidity ^0.8.0; contract Test {}',
          ContractName: 'TestContract',
          ABI: '[{"type":"constructor"}]',
        },
      ])
    })

    it('should fetch contract source code from RoutesScan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract RouteTest {}',
              ContractName: 'RouteTestContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ROUTESCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(getChainIdStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'contract RouteTest {}',
          ContractName: 'RouteTestContract',
          ABI: '[]',
        },
      ])
    })

    it('should fetch contract source code from Chiliz successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract ChilizTest {}',
              ContractName: 'ChilizTestContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)

      sandbox.stub(config, 'CHILIZ_API_URL').value('https://scan.chiliz.com')

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.CHILIZ, address, network)

      expect(axiosStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://scan.chiliz.com/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'contract ChilizTest {}',
          ContractName: 'ChilizTestContract',
          ABI: '[]',
        },
      ])
    })

    it('should fetch contract source code from BlockScout successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract BlockScoutTest {}',
              ContractName: 'BlockScoutTestContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const networkToAragonStub = sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          BLOCKSCOUT_API_URL: 'https://eth.blockscout.com/api',
          BLOCKSCOUT_API_KEY: 'blockscout-key',
        },
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.BLOCKSCOUT, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(networkToAragonStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://eth.blockscout.com/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
        apikey: 'blockscout-key',
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'contract BlockScoutTest {}',
          ContractName: 'BlockScoutTestContract',
          ABI: '[]',
        },
      ])
    })

    it('should fetch contract source code from ZkSync successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract ZkSyncTest {}',
              ContractName: 'ZkSyncTestContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)

      sandbox.stub(config, 'ZKSYNC_BLOCK_EXPLORER_API').value({
        MAINNET_BASE_URI: 'https://block-explorer-api.mainnet.zksync.io/api',
        SEPOLIA_BASE_URI: 'https://block-explorer-api.sepolia.zksync.io/api',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.ZKSYNC,
        address,
        NetworksEnum.zksyncMainnet,
      )

      expect(axiosStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://block-explorer-api.mainnet.zksync.io/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'contract ZkSyncTest {}',
          ContractName: 'ZkSyncTestContract',
          ABI: '[]',
        },
      ])
    })

    it('should return null when response status is not OK', async () => {
      const mockResponse = {
        data: {
          status: '0',
          message: 'fail',
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.be.null
    })

    it('should return null when source code is empty', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: '',
              ContractName: '',
              ABI: '',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.be.null
    })

    it('should return null when BlockScout API key is not configured', async () => {
      const networkToAragonStub = sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          BLOCKSCOUT_API_URL: 'https://eth.blockscout.com/api',
          BLOCKSCOUT_API_KEY: undefined,
        },
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.BLOCKSCOUT, address, network)

      expect(networkToAragonStub.calledOnce).to.be.true
      expect(result).to.be.null
    })

    it('should handle API errors gracefully', async () => {
      const error = new Error('Network error')
      const axiosStub = sandbox.stub(axios, 'get').rejects(error)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(loggerStub.called).to.be.true
      expect(result).to.be.null
    })

    it('should return null for unsupported explorer type', async () => {
      const result = await evmExplorerClient.fetchContractSourceCode('unsupported' as EvmExplorerEnum, address, network)

      expect(result).to.be.null
    })
  })

  describe('fetchContractCreation', () => {
    const address = '0xD84032c8a338B4b7023619D7c00710634B49e24a'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch contract creation from Etherscan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              blockNumber: 18000000,
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(getChainIdStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: address,
        apikey: 'test-api-key',
        chainid: 1,
      })

      expect(result).to.deep.equal({
        address: ethers.getAddress(address),
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 18000000,
      })
    })

    it('should fetch contract creation from RoutesScan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              txHash: '0xroutehash',
              blockNumber: 19000000,
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ROUTESCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(getChainIdStub.calledOnce).to.be.true

      expect(result).to.deep.equal({
        address: ethers.getAddress('0xD84032c8a338B4b7023619D7c00710634B49e24a'),
        transactionHash: '0xroutehash',
        blockNumber: 19000000,
      })
    })

    it('should handle missing transaction hash gracefully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              blockNumber: 18000000,
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        address: ethers.getAddress('0xD84032c8a338B4b7023619D7c00710634B49e24a'),
        transactionHash: '',
        blockNumber: 18000000,
      })
    })

    it('should return default values when response is empty', async () => {
      const mockResponse = {
        data: {
          status: '0',
          message: 'fail',
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        address,
        transactionHash: '',
        blockNumber: 0,
      })
    })

    it('should handle API errors gracefully', async () => {
      const error = new Error('Network error')
      const axiosStub = sandbox.stub(axios, 'get').rejects(error)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(loggerStub.called).to.be.true
      expect(result).to.deep.equal({
        address,
        transactionHash: '',
        blockNumber: 0,
      })
    })

    it('should return default values for unsupported explorer type', async () => {
      const result = await evmExplorerClient.fetchContractCreation('unsupported' as EvmExplorerEnum, address, network)

      expect(result).to.deep.equal({
        address,
        transactionHash: '',
        blockNumber: 0,
      })
    })
  })

  describe('ZkSync network handling', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'

    it('should use correct ZkSync mainnet URL', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract ZkSyncMainnet {}',
              ContractName: 'ZkSyncMainnetContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)

      sandbox.stub(config, 'ZKSYNC_BLOCK_EXPLORER_API').value({
        MAINNET_BASE_URI: 'https://block-explorer-api.mainnet.zksync.io/api',
        SEPOLIA_BASE_URI: 'https://block-explorer-api.sepolia.zksync.io/api',
      })

      await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ZKSYNC, address, NetworksEnum.zksyncMainnet)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://block-explorer-api.mainnet.zksync.io/api')
    })

    it('should use correct ZkSync sepolia URL', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract ZkSyncSepolia {}',
              ContractName: 'ZkSyncSepoliaContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)

      sandbox.stub(config, 'ZKSYNC_BLOCK_EXPLORER_API').value({
        MAINNET_BASE_URI: 'https://block-explorer-api.mainnet.zksync.io/api',
        SEPOLIA_BASE_URI: 'https://block-explorer-api.sepolia.zksync.io/api',
      })

      await evmExplorerClient.fetchContractSourceCode(EvmExplorerEnum.ZKSYNC, address, NetworksEnum.zksyncSepolia)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://block-explorer-api.sepolia.zksync.io/api')
    })
  })

  describe('RoutesScan custom URL segments', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    it('should use custom URL segment when provided', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract Custom {}',
              ContractName: 'CustomContract',
              ABI: '[]',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      // Test internal method with custom URL segments (this would be used internally)
      const client = evmExplorerClient as any
      await client.apiCall(
        EvmExplorerEnum.ROUTESCAN,
        {
          module: 'contract',
          action: 'getsourcecode',
          address,
        },
        network,
        'custom/path',
      )

      expect(axiosStub.calledOnce).to.be.true
      expect(getChainIdStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://api.routescan.io/v2/network/mainnet/evm/1/custom/path')
    })
  })
})
