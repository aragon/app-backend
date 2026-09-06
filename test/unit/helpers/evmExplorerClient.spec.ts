import config from '@config'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import * as retryRequestModule from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import { ethers } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    sandbox.stub(BottleneckModule, 'getRouteScanLimiter').returns({
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
      expect(result).to.be.null
    })

    it('should return undefined for unsupported explorer type', async () => {
      const result = await evmExplorerClient.fetchTokenInfo('unsupported' as EvmExplorerEnum, address, network)

      expect(result).to.be.undefined
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
  })

  describe('getBlockByTimestamp', () => {
    const network = NetworksEnum.ethereumMainnet
    const timestamp = 1700000000

    it('should return block number on successful response', async () => {
      const mockResponse = {
        data: {
          status: '1',
          result: '18500000',
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, timestamp, network)

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'block',
        action: 'getblocknobytime',
        timestamp,
        closest: 'before',
      })
      expect(result).to.equal(18500000)
    })

    it('should return 0 when response status is not 1', async () => {
      const mockResponse = {
        data: {
          status: '0',
          result: null,
        },
      }

      sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, timestamp, network)

      expect(loggerStub.called).to.be.true
      expect(result).to.equal(0)
    })

    it('should return 0 on error', async () => {
      sandbox.stub(axios, 'get').rejects(new Error('Network error'))
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })

      const result = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, timestamp, network)

      expect(loggerStub.called).to.be.true
      expect(result).to.equal(0)
    })
  })

  describe('getBlockNumberFromTxHash (via fetchContractCreation)', () => {
    const address = '0xD84032c8a338B4b7023619D7c00710634B49e24a'
    const network = NetworksEnum.ethereumMainnet

    it('should resolve block number from tx hash when blockNumber is missing in creation response', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            },
          ],
        },
      }

      sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: sandbox.stub().resolves({ blockNumber: 12345678 }),
      } as any)

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(result).to.deep.equal({
        address: ethers.getAddress(address),
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 12345678,
      })
    })

    it('should return 0 as block number when getTransactionReceipt resolves null', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            },
          ],
        },
      }

      sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: sandbox.stub().resolves(null),
      } as any)

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(result).to.deep.equal({
        address: ethers.getAddress(address),
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 0,
      })
    })

    it('should return 0 as block number when getTransactionReceipt fails', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              contractAddress: address,
              txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            },
          ],
        },
      }

      sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(1)
      sandbox.stub(config, 'ETHERSCAN_API').value({
        BASE_URI: 'https://api.etherscan.io/api',
        API_KEY: 'test-api-key',
      })
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: sandbox.stub().rejects(new Error('RPC error')),
      } as any)

      const result = await evmExplorerClient.fetchContractCreation(EvmExplorerEnum.ETHERSCAN, address, network)

      expect(loggerStub.called).to.be.true
      expect(result).to.deep.equal({
        address: ethers.getAddress(address),
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 0,
      })
    })
  })

  describe('Blockscout explorer', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'

    it('should fetch contract source code from Blockscout for Citrea testnet', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [
            {
              SourceCode: 'contract CitreaTest {}',
              ContractName: 'CitreaTestContract',
              ABI: '[]',
              CompilerVersion: 'solc',
            },
          ],
        },
      }

      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)

      sandbox.stub(config, 'BLOCKSCOUT_EXPLORER_API').value({
        CITREA_MAINNET_BASE_URI: 'https://explorer.mainnet.citrea.xyz/api',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT,
        address,
        NetworksEnum.citreaMainnet,
      )

      expect(axiosStub.calledOnce).to.be.true

      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://explorer.mainnet.citrea.xyz/api')
      expect((callArgs[1] as any).params).to.deep.include({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })

      expect(result).to.deep.equal([
        {
          SourceCode: 'contract CitreaTest {}',
          ContractName: 'CitreaTestContract',
          ABI: '[]',
          CompilerVersion: 'solc',
        },
      ])
    })

    it('should return null when Blockscout is called with unsupported network', async () => {
      sandbox.stub(config, 'BLOCKSCOUT_EXPLORER_API').value({
        CITREA_MAINNET_BASE_URI: 'https://explorer.mainnet.citrea.xyz/api',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT,
        address,
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.null
    })

    it('should send the browser user agent on Blockscout calls', async () => {
      const axiosStub = sandbox.stub(axios, 'get').resolves({ data: { status: '0', result: [] } })

      sandbox.stub(config, 'BLOCKSCOUT_EXPLORER_API').value({
        ROBINHOOD_MAINNET_BASE_URI: 'https://robinhoodchain.blockscout.com/api',
        USER_AGENT: 'Mozilla/5.0 test-agent',
      })

      await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT,
        address,
        NetworksEnum.robinhoodMainnet,
      )

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://robinhoodchain.blockscout.com/api')
      expect((callArgs[1] as any).headers).to.deep.equal({ 'User-Agent': 'Mozilla/5.0 test-agent' })
    })

    it('should call the Blockscout PRO API with the chain id in the path and the apikey', async () => {
      const mockResponse = {
        data: {
          status: '1',
          message: 'OK',
          result: [{ SourceCode: 'contract RobinhoodTest {}', ContractName: 'RobinhoodTest', ABI: '[]' }],
        },
      }
      const axiosStub = sandbox.stub(axios, 'get').resolves(mockResponse)
      sandbox.stub(ProviderModule, 'getChainId').returns(4663)

      sandbox.stub(config, 'BLOCKSCOUT_PRO_API').value({
        BASE_URI: 'https://api.blockscout.com',
        API_KEY: 'proapi_test',
      })

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT_PRO,
        address,
        NetworksEnum.robinhoodMainnet,
      )

      expect(axiosStub.calledOnce).to.be.true
      const callArgs = axiosStub.firstCall.args
      expect(callArgs[0]).to.equal('https://api.blockscout.com/4663/api')
      expect((callArgs[1] as any).params).to.deep.equal({
        module: 'contract',
        action: 'getsourcecode',
        address,
        apikey: 'proapi_test',
      })
      expect(result![0].ContractName).to.equal('RobinhoodTest')
    })

    it('should skip the Blockscout PRO API when no key is configured', async () => {
      const axiosStub = sandbox.stub(axios, 'get')

      sandbox.stub(config, 'BLOCKSCOUT_PRO_API').value({
        BASE_URI: 'https://api.blockscout.com',
        API_KEY: null,
      })

      const result = await evmExplorerClient.fetchContractSourceCode(
        EvmExplorerEnum.BLOCKSCOUT_PRO,
        address,
        NetworksEnum.robinhoodMainnet,
      )

      expect(axiosStub.called).to.be.false
      expect(result).to.be.null
    })
  })
})
