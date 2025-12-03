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
    loggerStub = sandbox.stub(logger, 'warn')
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
          CompilerVersion: undefined,
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
              CompilerVersion: 'vyper',
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
          CompilerVersion: 'vyper',
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
              CompilerVersion: 'solc',
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
          CompilerVersion: 'solc',
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
              CompilerVersion: 'solc',
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
          CompilerVersion: 'solc',
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
              CompilerVersion: 'solc',
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
          CompilerVersion: 'solc',
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

    it('should extract contract name from full path when ContractName contains colon', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'pragma solidity ^0.8.0; contract ERC1967Proxy {}',
              ContractName: '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
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

      expect(result).to.deep.equal([
        {
          SourceCode: 'pragma solidity ^0.8.0; contract ERC1967Proxy {}',
          ContractName: 'ERC1967Proxy',
          ABI: '[{"type":"constructor"}]',
          CompilerVersion: undefined,
        },
      ])
    })

    it('should keep original contract name when no colon is present', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'pragma solidity ^0.8.0; contract SimpleContract {}',
              ContractName: 'SimpleContract',
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

      expect(result).to.deep.equal([
        {
          SourceCode: 'pragma solidity ^0.8.0; contract SimpleContract {}',
          ContractName: 'SimpleContract',
          ABI: '[{"type":"constructor"}]',
          CompilerVersion: undefined,
        },
      ])
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

    it('should use address parameter when contractAddress and blockNumber are missing', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              txHash: '0xsometxhash',
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
        address: ethers.getAddress(address),
        transactionHash: '0xsometxhash',
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

  describe('getTokenBalances', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch token balances successfully', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              TokenName: 'USD Coin',
              TokenSymbol: 'USDC',
              TokenDivisor: '6',
              TokenQuantity: '1000000000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
              TokenName: 'Tether USD',
              TokenSymbol: 'USDT',
              TokenDivisor: '6',
              TokenQuantity: '2000000000',
              TokenPriceUSD: '0.99',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.include({
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        originalBalance: '1000000000',
        priceUsd: '1.00',
      })
      expect(result[1]).to.deep.include({
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        originalBalance: '2000000000',
        priceUsd: '0.99',
      })
    })

    it('should filter out tokens with empty TokenName', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: 'Valid Token',
              TokenSymbol: 'VLD',
              TokenDivisor: '18',
              TokenQuantity: '1000000000000000000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xtoken2',
              TokenName: '',
              TokenSymbol: 'EMPTY',
              TokenDivisor: '18',
              TokenQuantity: '2000000000000000000',
              TokenPriceUSD: '2.00',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0].name).to.equal('Valid Token')
    })

    it('should filter out tokens with empty TokenSymbol', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: 'Valid Token',
              TokenSymbol: 'VLD',
              TokenDivisor: '18',
              TokenQuantity: '1000000000000000000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xtoken2',
              TokenName: 'No Symbol Token',
              TokenSymbol: '',
              TokenDivisor: '18',
              TokenQuantity: '2000000000000000000',
              TokenPriceUSD: '2.00',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0].symbol).to.equal('VLD')
    })

    it('should filter out tokens with empty TokenDivisor', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: 'Valid Token',
              TokenSymbol: 'VLD',
              TokenDivisor: '18',
              TokenQuantity: '1000000000000000000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xtoken2',
              TokenName: 'No Divisor Token',
              TokenSymbol: 'NODIV',
              TokenDivisor: '',
              TokenQuantity: '2000000000000000000',
              TokenPriceUSD: '2.00',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0].decimals).to.equal(18)
    })

    it('should return empty array when result is empty', async () => {
      const mockResponse = {
        data: {
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should return empty array when result is null', async () => {
      const mockResponse = {
        data: {
          result: null,
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should return empty array when response is null', async () => {
      const mockResponse = {
        data: null,
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should handle API errors gracefully and return empty array', async () => {
      const error = new Error('Network error')
      const axiosStub = sandbox.stub(axios, 'get').rejects(error)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(loggerStub.called).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should return empty array for unsupported explorer type', async () => {
      const result = await evmExplorerClient.getTokenBalances('unsupported' as EvmExplorerEnum, address, network)

      expect(result).to.deep.equal([])
    })

    it('should correctly build API params for token balances request', async () => {
      const mockResponse = {
        data: {
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'account',
        action: 'addresstokenbalance',
        address,
        apikey: 'test-api-key',
        chainid: 1,
      })
    })

    it('should filter out all tokens when none have valid data', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: '',
              TokenSymbol: '',
              TokenDivisor: '',
              TokenQuantity: '1000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xtoken2',
              TokenName: 'Name Only',
              TokenSymbol: '',
              TokenDivisor: '',
              TokenQuantity: '2000',
              TokenPriceUSD: '2.00',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal([])
    })

    it('should work with different explorer types', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: 'Test Token',
              TokenSymbol: 'TEST',
              TokenDivisor: '18',
              TokenQuantity: '1000000000000000000',
              TokenPriceUSD: '1.00',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ROUTESCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0].name).to.equal('Test Token')
    })

    it('should handle tokens with various decimal values', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              TokenAddress: '0xtoken1',
              TokenName: 'Token 6 Decimals',
              TokenSymbol: 'T6',
              TokenDivisor: '6',
              TokenQuantity: '1000000',
              TokenPriceUSD: '1.00',
            },
            {
              TokenAddress: '0xtoken2',
              TokenName: 'Token 18 Decimals',
              TokenSymbol: 'T18',
              TokenDivisor: '18',
              TokenQuantity: '1000000000000000000',
              TokenPriceUSD: '2.00',
            },
            {
              TokenAddress: '0xtoken3',
              TokenName: 'Token 8 Decimals',
              TokenSymbol: 'T8',
              TokenDivisor: '8',
              TokenQuantity: '100000000',
              TokenPriceUSD: '3.00',
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

      const result = await evmExplorerClient.getTokenBalances(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(3)
      expect(result[0].decimals).to.equal(6)
      expect(result[1].decimals).to.equal(18)
      expect(result[2].decimals).to.equal(8)
    })
  })

  describe('fetchTokenInfo', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const network = NetworksEnum.ethereumMainnet

    it('should fetch token info from Etherscan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'USD Coin',
              symbol: 'USDC',
              tokenDecimal: '6',
              tokenPriceUSD: '1.00',
              totalSupply: '50000000000000',
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

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'token',
        action: 'tokeninfo',
        contractaddress: address,
        apikey: 'test-api-key',
        chainid: 1,
      })

      expect(result).to.deep.equal({
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: '6',
        priceUsd: '1.00',
        totalSupply: '50000000000000',
      })
    })

    it('should fetch token info from RouteScan successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'Wrapped Ether',
              symbol: 'WETH',
              tokenDecimal: '18',
              tokenPriceUSD: '2500.00',
              totalSupply: '100000000000000000000000',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ROUTESCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api')

      expect(result).to.deep.equal({
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: '18',
        priceUsd: '2500.00',
        totalSupply: '100000000000000000000000',
      })
    })

    it('should use divisor field when tokenDecimal is not present', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'Test Token',
              symbol: 'TEST',
              divisor: '8',
              tokenPriceUSD: '0.50',
              totalSupply: '1000000000',
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

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: '8',
        priceUsd: '0.50',
        totalSupply: '1000000000',
      })
    })

    it('should return 0 for decimals when neither tokenDecimal nor divisor is present', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'No Decimal Token',
              symbol: 'NDT',
              tokenPriceUSD: '0.10',
              totalSupply: '999999',
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

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result.decimals).to.equal(0)
    })

    it('should return default values when tokenPriceUSD and totalSupply are missing', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'Minimal Token',
              symbol: 'MIN',
              tokenDecimal: '18',
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

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        name: 'Minimal Token',
        symbol: 'MIN',
        decimals: '18',
        priceUsd: '0',
        totalSupply: '0',
      })
    })

    it('should return undefined when response status is not OK', async () => {
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

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.be.undefined
    })

    it('should return undefined when result is empty', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(result).to.be.undefined
    })

    it('should handle API errors gracefully and return undefined', async () => {
      const error = new Error('Network error')
      const axiosStub = sandbox.stub(axios, 'get').rejects(error)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(axiosStub.calledOnce).to.be.true
      expect(loggerStub.called).to.be.true
      expect(result).to.be.undefined
    })

    it('should return undefined for unsupported explorer type', async () => {
      const result = await evmExplorerClient.fetchTokenInfo('unsupported' as EvmExplorerEnum, address, network)

      expect(result).to.be.undefined
    })

    it('should fetch token info from Chiliz successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'Chiliz Token',
              symbol: 'CHZ',
              tokenDecimal: '18',
              tokenPriceUSD: '0.08',
              totalSupply: '8888888888000000000000000000',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(config, 'CHILIZ_API_URL').value('https://scan.chiliz.com')

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.CHILIZ, address, NetworksEnum.chilizMainnet)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://scan.chiliz.com/api')

      expect(result).to.deep.equal({
        name: 'Chiliz Token',
        symbol: 'CHZ',
        decimals: '18',
        priceUsd: '0.08',
        totalSupply: '8888888888000000000000000000',
      })
    })

    it('should fetch token info from ZkSync mainnet successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'ZkSync Token',
              symbol: 'ZK',
              tokenDecimal: '18',
              tokenPriceUSD: '0.15',
              totalSupply: '21000000000000000000000000000',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(config, 'ZKSYNC_BLOCK_EXPLORER_API').value({
        MAINNET_BASE_URI: 'https://block-explorer-api.mainnet.zksync.io/api',
        SEPOLIA_BASE_URI: 'https://block-explorer-api.sepolia.zksync.io/api',
      })

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.ZKSYNC, address, NetworksEnum.zksyncMainnet)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://block-explorer-api.mainnet.zksync.io/api')

      expect(result).to.deep.equal({
        name: 'ZkSync Token',
        symbol: 'ZK',
        decimals: '18',
        priceUsd: '0.15',
        totalSupply: '21000000000000000000000000000',
      })
    })

    it('should fetch token info from BlockScout successfully', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              tokenName: 'BlockScout Token',
              symbol: 'BST',
              tokenDecimal: '18',
              tokenPriceUSD: '0.25',
              totalSupply: '1000000000000000000000000',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET')
      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          BLOCKSCOUT_API_URL: 'https://eth.blockscout.com/api',
          BLOCKSCOUT_API_KEY: 'blockscout-key',
        },
      })

      const result = await evmExplorerClient.fetchTokenInfo(EvmExplorerEnum.BLOCKSCOUT, address, network)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://eth.blockscout.com/api')
      expect((callArgs[1] as any).params).to.deep.include({
        apikey: 'blockscout-key',
      })

      expect(result).to.deep.equal({
        name: 'BlockScout Token',
        symbol: 'BST',
        decimals: '18',
        priceUsd: '0.25',
        totalSupply: '1000000000000000000000000',
      })
    })
  })
})
