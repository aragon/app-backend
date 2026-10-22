import config from '@config'
import AnkrHelper from '@helpers/ankrHelper'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { AnkrNetworksEnum, type HexAddress, NetworksEnum } from '@src/types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: AnkrHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('ankrNetworkMap', () => {
    it('should have correct network mappings', () => {
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.ethereumMainnet]).to.eq(AnkrNetworksEnum.ethereumMainnet)
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.ethereumSepolia]).to.eq(AnkrNetworksEnum.ethereumSepolia)
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.polygonMainnet]).to.eq(AnkrNetworksEnum.polygonMainnet)
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.baseMainnet]).to.eq(AnkrNetworksEnum.baseMainnet)
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.arbitrumMainnet]).to.eq(AnkrNetworksEnum.arbitrumMainnet)
      expect(AnkrHelper.ankrNetworkMap[NetworksEnum.optimismMainnet]).to.eq(AnkrNetworksEnum.optimismMainnet)
    })
  })

  describe('_constructUrl', () => {
    beforeEach(() => {
      sandbox.stub(config, 'ANKR_CONFIG').value({
        API_URL: 'https://rpc.ankr.com',
        API_KEY: 'test-api-key',
      })
    })

    it('should construct URLs correctly for supported networks', () => {
      const getChainIdStub = sandbox.stub(ProviderModule, 'getChainId').returns(1)

      const result = AnkrHelper._constructUrl(NetworksEnum.ethereumMainnet)

      expect(result).to.not.be.null
      expect(result!.blockchain).to.eq(AnkrNetworksEnum.ethereumMainnet)
      expect(result!.chainId).to.eq(1)
      expect(result!.multichainApiUrl).to.eq('https://rpc.ankr.com/multichain/test-api-key')
      expect(result!.chainUrl).to.eq(`https://rpc.ankr.com/${AnkrNetworksEnum.ethereumMainnet}/test-api-key`)
      expect(getChainIdStub.calledOnce).to.be.true
      expect(getChainIdStub.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should return null for unsupported networks', () => {
      const result = AnkrHelper._constructUrl('unsupported-network' as NetworksEnum)

      expect(result).to.be.null
    })

    it('should handle different networks correctly', () => {
      sandbox.stub(ProviderModule, 'getChainId').returns(137)

      const result = AnkrHelper._constructUrl(NetworksEnum.polygonMainnet)

      expect(result).to.not.be.null
      expect(result!.blockchain).to.eq(AnkrNetworksEnum.polygonMainnet)
      expect(result!.chainId).to.eq(137)
    })
  })

  describe('_rpcCall', () => {
    it('should make successful RPC call', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: { test: 'data' },
        },
      }
      const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      const result = await AnkrHelper._rpcCall('https://test.com', 'test_method', { param: 'value' })

      expect(result).to.deep.eq(mockResponse.data)
      expect(axiosStub.calledOnce).to.be.true
      expect(
        axiosStub.calledWith(
          'https://test.com',
          {
            jsonrpc: '2.0',
            method: 'test_method',
            params: { param: 'value' },
            id: 1,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ).to.be.true
    })

    it('should handle axios errors', async () => {
      const error = new Error('Network error')
      const axiosStub = sandbox.stub(axios, 'post').rejects(error)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await AnkrHelper._rpcCall('https://test.com', 'test_method', { param: 'value' })

      expect(result).to.be.null
      expect(axiosStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error making RPC call' as any)).to.be.true
    })

    it('should include correct request body structure', async () => {
      const mockResponse = { data: { jsonrpc: '2.0', id: 1, result: {} } }
      const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      await AnkrHelper._rpcCall('https://test.com', 'ankr_getTokenHoldersCount', {
        blockchain: 'eth',
        contractAddress: '0x123',
        pageSize: 1,
      })

      const requestBody = axiosStub.firstCall.args[1]
      expect(requestBody).to.deep.eq({
        jsonrpc: '2.0',
        method: 'ankr_getTokenHoldersCount',
        params: {
          blockchain: 'eth',
          contractAddress: '0x123',
          pageSize: 1,
        },
        id: 1,
      })
    })
  })

  describe('getTokenHoldersCount', () => {
    const tokenAddress: HexAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    const network = NetworksEnum.ethereumMainnet

    beforeEach(() => {
      sandbox.stub(config, 'ANKR_CONFIG').value({
        API_URL: 'https://rpc.ankr.com',
        API_KEY: 'test-api-key',
      })
    })

    it('should get token holders count successfully', async () => {
      const constructUrlStub = sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockchain: 'eth',
          contractAddress: tokenAddress,
          tokenDecimals: 6,
          holderCountHistory: [
            {
              holderCount: 4498953,
              totalAmount: '36819785005.419766',
              totalAmountRawInteger: '36819785005419766',
              lastUpdatedAt: '2022-07-29T05:41:21Z',
            },
          ],
        },
      }

      const rpcCallStub = sandbox.stub(AnkrHelper, '_rpcCall').resolves(mockResponse)

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.deep.eq({
        holders: 4498953,
        transfers: 0,
      })
      expect(constructUrlStub.calledOnce).to.be.true
      expect(constructUrlStub.calledWith(network)).to.be.true
      expect(rpcCallStub.calledOnce).to.be.true
      expect(
        rpcCallStub.calledWith('https://rpc.ankr.com/multichain', 'ankr_getTokenHoldersCount', {
          blockchain: 'eth',
          contractAddress: tokenAddress,
          pageSize: 1,
        }),
      ).to.be.true
    })

    it('should return null when network mapping not found', async () => {
      const constructUrlStub = sandbox.stub(AnkrHelper, '_constructUrl').returns(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.be.null
      expect(constructUrlStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('No Ankr network mapping found' as any)).to.be.true
    })

    it('should return null when API response is invalid', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockchain: 'eth',
          contractAddress: tokenAddress,
          tokenDecimals: 6,
          holderCountHistory: [],
        },
      }

      sandbox.stub(AnkrHelper, '_rpcCall').resolves(mockResponse)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Invalid response from Ankr API' as any)).to.be.true
    })

    it('should return null when RPC call returns null', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      sandbox.stub(AnkrHelper, '_rpcCall').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Invalid response from Ankr API' as any)).to.be.true
    })

    it('should handle errors in getTokenHoldersCount', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      const error = new Error('RPC Call Failed')
      sandbox.stub(AnkrHelper, '_rpcCall').rejects(error)
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error getting token holders count' as any)).to.be.true
    })

    it('should handle multiple holder count history entries', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockchain: 'eth',
          contractAddress: tokenAddress,
          tokenDecimals: 6,
          holderCountHistory: [
            {
              holderCount: 4500000,
              totalAmount: '36819785005.419766',
              totalAmountRawInteger: '36819785005419766',
              lastUpdatedAt: '2022-07-30T05:41:21Z',
            },
            {
              holderCount: 4498953,
              totalAmount: '36819785005.419766',
              totalAmountRawInteger: '36819785005419766',
              lastUpdatedAt: '2022-07-29T05:41:21Z',
            },
          ],
        },
      }

      sandbox.stub(AnkrHelper, '_rpcCall').resolves(mockResponse)

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.deep.eq({
        holders: 4500000, // Should use the first (latest) entry
        transfers: 0,
      })
    })

    it('should handle zero holder count', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'eth',
        chainId: 1,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/eth/test-api-key',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockchain: 'eth',
          contractAddress: tokenAddress,
          tokenDecimals: 6,
          holderCountHistory: [
            {
              holderCount: 0,
              totalAmount: '0',
              totalAmountRawInteger: '0',
              lastUpdatedAt: '2022-07-29T05:41:21Z',
            },
          ],
        },
      }

      sandbox.stub(AnkrHelper, '_rpcCall').resolves(mockResponse)

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, network)

      expect(result).to.deep.eq({
        holders: 0,
        transfers: 0,
      })
    })

    it('should work with different networks', async () => {
      sandbox.stub(AnkrHelper, '_constructUrl').returns({
        blockchain: 'polygon',
        chainId: 137,
        multichainApiUrl: 'https://rpc.ankr.com/multichain',
        chainUrl: 'https://rpc.ankr.com/polygon/test-api-key',
      })

      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockchain: 'polygon',
          contractAddress: tokenAddress,
          tokenDecimals: 18,
          holderCountHistory: [
            {
              holderCount: 1000,
              totalAmount: '1000000000000000000000',
              totalAmountRawInteger: '1000000000000000000000',
              lastUpdatedAt: '2022-07-29T05:41:21Z',
            },
          ],
        },
      }

      const rpcCallStub = sandbox.stub(AnkrHelper, '_rpcCall').resolves(mockResponse)

      const result = await AnkrHelper.getTokenHoldersCount(tokenAddress, NetworksEnum.polygonMainnet)

      expect(result).to.deep.eq({
        holders: 1000,
        transfers: 0,
      })
      expect(
        rpcCallStub.calledWith('https://rpc.ankr.com/multichain', 'ankr_getTokenHoldersCount', {
          blockchain: 'polygon',
          contractAddress: tokenAddress,
          pageSize: 1,
        }),
      ).to.be.true
    })
  })
})
