import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import Utils from '@helpers/utils'
import logger from '@logger'
import { NetworksEnum } from '@types'
import axios from 'axios'

describe('Helpers:Web3BatchHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('executeBatch', () => {
    it('should return empty array if requests are empty', async () => {
      const result = await Web3BatchHelper.executeBatch([], NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal([])
    })

    it('should execute small batch requests using _executeSingleBatch', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
        { method: 'eth_call', params: [{ to: '0x456', data: '0xdef' }, 'latest'], identifier: 'test2' },
      ]

      const executeSingleBatchStub = sandbox.stub(Web3BatchHelper, '_executeSingleBatch').resolves([
        { identifier: 'test1', success: true, data: 'result1' },
        { identifier: 'test2', success: true, data: 'result2' },
      ])

      const results = await Web3BatchHelper.executeBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(executeSingleBatchStub.calledOnce).to.be.true
      expect(results).to.have.length(2)
      expect(results[0]).to.deep.equal({ identifier: 'test1', success: true, data: 'result1' })
      expect(results[1]).to.deep.equal({ identifier: 'test2', success: true, data: 'result2' })
    })

    it('should handle large batch requests using asyncBatchProcess', async () => {
      const mockRequests = Array.from({ length: 1000 }, (_, i) => ({
        method: 'eth_call',
        params: [{ to: '0x123', data: '0xabc' }, 'latest'],
        identifier: `test${i}`,
      }))

      // Mock the processor function to actually execute and add results
      const asyncBatchProcessStub = sandbox.stub(Utils, 'asyncBatchProcess').callsFake(async function (
        this: any,
        ...args: any[]
      ): Promise<any[]> {
        const [items, processor, options] = args
        const allResults: any[] = []
        // Simulate processing some items
        for (let i = 0; i < 3; i++) {
          try {
            await processor(items[i])
          } catch (error) {
            // Simulate an error on the third item
            if (i === 2 && options.onError) {
              options.onError(error, items[i])
            }
          }
        }
        return allResults
      })

      // Mock _processSingleRequest to return results for first two calls and throw for third
      const processSingleRequestStub = sandbox.stub(Web3BatchHelper, '_processSingleRequest')
      processSingleRequestStub.onCall(0).resolves({ identifier: 'test0', success: true, data: 'result0' })
      processSingleRequestStub.onCall(1).resolves({ identifier: 'test1', success: true, data: 'result1' })
      processSingleRequestStub.onCall(2).throws(new Error('Processing failed'))

      const results = await Web3BatchHelper.executeBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(asyncBatchProcessStub.calledOnce).to.be.true
      expect(asyncBatchProcessStub.firstCall.args[2]).to.deep.include({
        concurrency: 3,
        batchSize: 900,
        stopOnError: false,
      })
    })
  })

  describe('_processSingleRequest', () => {
    it('should process a single request successfully', async () => {
      const mockRequest = {
        method: 'eth_call',
        params: [{ to: '0x123', data: '0xabc' }, 'latest'],
        identifier: 'test1',
      }

      const executeSingleBatchStub = sandbox
        .stub(Web3BatchHelper, '_executeSingleBatch')
        .resolves([{ identifier: 'test1', success: true, data: 'result1' }])

      const result = await Web3BatchHelper._processSingleRequest(mockRequest, NetworksEnum.ethereumMainnet)

      expect(executeSingleBatchStub.calledOnce).to.be.true
      expect(result).to.deep.equal({ identifier: 'test1', success: true, data: 'result1' })
    })

    it('should handle errors in single request processing', async () => {
      const mockRequest = {
        method: 'eth_call',
        params: [{ to: '0x123', data: '0xabc' }, 'latest'],
        identifier: 'test1',
      }

      const error = new Error('Processing error')
      sandbox.stub(Web3BatchHelper, '_executeSingleBatch').rejects(error)

      const result = await Web3BatchHelper._processSingleRequest(mockRequest, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        identifier: 'test1',
        success: false,
        data: null,
        error,
      })
    })
  })

  describe('_executeSingleBatch', () => {
    it('should execute single batch requests successfully', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
        { method: 'eth_call', params: [{ to: '0x456', data: '0xdef' }, 'latest'], identifier: 'test2' },
      ]

      const mockResponse = {
        data: [
          { id: '1', result: 'result1' },
          { id: '2', result: 'result2' },
        ],
      }

      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')
      sandbox.stub(axios, 'post').resolves(mockResponse)

      const results = await Web3BatchHelper._executeSingleBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(results).to.have.length(2)
      expect(results[0]).to.deep.equal({ identifier: 'test1', success: true, data: 'result1' })
      expect(results[1]).to.deep.equal({ identifier: 'test2', success: true, data: 'result2' })
    })

    it('should handle RPC errors in single batch responses', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
      ]

      const mockResponse = {
        data: [{ id: '1', error: { code: -32000, message: 'RPC error' } }],
      }

      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')
      sandbox.stub(axios, 'post').resolves(mockResponse)

      const results = await Web3BatchHelper._executeSingleBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(results).to.have.length(1)
      expect(results[0]).to.deep.equal({
        identifier: 'test1',
        success: false,
        data: null,
        error: { code: -32000, message: 'RPC error' },
      })
    })

    it('should handle axios errors in single batch', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
      ]

      const axiosError = new Error('Network error')
      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')
      sandbox.stub(axios, 'post').rejects(axiosError)

      const results = await Web3BatchHelper._executeSingleBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(results).to.have.length(1)
      expect(results[0]).to.deep.equal({
        identifier: 'test1',
        success: false,
        data: null,
        error: axiosError,
      })
    })
  })

  describe('encodeFunction', () => {
    it('should correctly encode function calls', () => {
      const functionSignature = 'balanceOf(address)'
      const paramTypes = ['address']
      const paramValues = ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'] // vitalik.eth address

      const functionSelector = '0x70a08231'

      const encodedParams = '0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045'

      const result = Web3BatchHelper.encodeFunction(functionSignature, paramTypes, paramValues)

      expect(result).to.equal(functionSelector + encodedParams.slice(2))
    })
  })

  describe('decodeResult', () => {
    it('should correctly decode results', () => {
      const types = ['address']
      const data = '0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045'
      const expectedDecodedValue = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

      const result = Web3BatchHelper.decodeResult(types, data)

      expect(result!.toString()).to.equal(expectedDecodedValue)
    })
  })

  describe('ethCall', () => {
    it('should make batch eth_call requests', async () => {
      const mockCalls = [
        { to: '0x123', data: '0xabc', identifier: 'test1' },
        { to: '0x456', data: '0xdef', identifier: 'test2' },
      ]

      const executeBatchStub = sandbox.stub(Web3BatchHelper, 'executeBatch').resolves([
        { identifier: 'test1', success: true, data: 'result1' },
        { identifier: 'test2', success: true, data: 'result2' },
      ])

      const results = await Web3BatchHelper.ethCall(mockCalls, NetworksEnum.ethereumMainnet)

      expect(executeBatchStub.calledOnce).to.be.true
      expect(executeBatchStub.firstCall.args[0]).to.deep.equal([
        {
          method: 'eth_call',
          params: [{ to: '0x123', data: '0xabc' }, 'latest'],
          identifier: 'test1',
        },
        {
          method: 'eth_call',
          params: [{ to: '0x456', data: '0xdef' }, 'latest'],
          identifier: 'test2',
        },
      ])
      expect(results).to.have.length(2)
    })

    it('should use custom block tag', async () => {
      const mockCalls = [{ to: '0x123', data: '0xabc', identifier: 'test1' }]

      const executeBatchStub = sandbox
        .stub(Web3BatchHelper, 'executeBatch')
        .resolves([{ identifier: 'test1', success: true, data: 'result1' }])

      await Web3BatchHelper.ethCall(mockCalls, NetworksEnum.ethereumMainnet, '0x123abc')

      expect(executeBatchStub.firstCall.args[0][0].params[1]).to.equal('0x123abc')
    })
  })

  describe('getLockVotingPowerAtInBatch', () => {
    it('should return empty array if batchParams are empty', async () => {
      const result = await Web3BatchHelper.getLockVotingPowerAtInBatch([], NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal([])
    })

    it('should get voting power in batch', async () => {
      const mockParams = [
        { escrowAddress: '0x123', tokenId: '1', ts: 1000 },
        { escrowAddress: '0x123', tokenId: '2', ts: 1000 },
      ]

      const encodeFunctionStub = sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')

      const ethCallStub = sandbox.stub(Web3BatchHelper, 'ethCall').resolves([
        { identifier: '1', success: true, data: '0xdata1' },
        { identifier: '2', success: true, data: '0xdata2' },
      ])

      const decodeResultStub = sandbox.stub(Web3BatchHelper, 'decodeResult')
      decodeResultStub.onFirstCall().returns([100n])
      decodeResultStub.onSecondCall().returns([200n])

      const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(encodeFunctionStub.calledTwice).to.be.true
      expect(ethCallStub.calledOnce).to.be.true
      expect(decodeResultStub.calledTwice).to.be.true
      expect(results).to.deep.equal([
        { tokenId: '1', votingPower: 100n },
        { tokenId: '2', votingPower: 200n },
      ])
    })

    it('should handle errors and return zero voting power', async () => {
      const mockParams = [{ escrowAddress: '0x123', tokenId: '1', ts: 1000 }]

      sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')
      sandbox
        .stub(Web3BatchHelper, 'ethCall')
        .resolves([{ identifier: '1', success: false, error: new Error('RPC error'), data: null }])

      const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal([{ tokenId: '1', votingPower: 0n }])
    })

    it('should handle decode errors and return zero voting power', async () => {
      const mockParams = [{ escrowAddress: '0x123', tokenId: '1', ts: 1000 }]

      sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')
      sandbox.stub(Web3BatchHelper, 'ethCall').resolves([{ identifier: '1', success: true, data: '0xinvaliddata' }])

      // Make decodeResult throw an error
      sandbox.stub(Web3BatchHelper, 'decodeResult').throws(new Error('Decode error'))

      const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal([{ tokenId: '1', votingPower: 0n }])
    })

    it('should handle overall errors and return zero voting power for all params', async () => {
      const mockParams = [
        { escrowAddress: '0x123', tokenId: '1', ts: 1000 },
        { escrowAddress: '0x123', tokenId: '2', ts: 1000 },
      ]

      // Make encodeFunction throw an error to trigger the catch block
      sandbox.stub(Web3BatchHelper, 'encodeFunction').throws(new Error('Encoding error'))

      const results = await Web3BatchHelper.getLockVotingPowerAtInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal([
        { tokenId: '1', votingPower: 0n },
        { tokenId: '2', votingPower: 0n },
      ])
    })
  })

  describe('callRpcMethod', () => {
    it('should make generic RPC calls in batch', async () => {
      const method = 'eth_getBalance'
      const batchParams = [
        { params: ['0x123', 'latest'], identifier: 'addr1' },
        { params: ['0x456', 'latest'], identifier: 'addr2' },
      ]

      const executeBatchStub = sandbox.stub(Web3BatchHelper, 'executeBatch').resolves([
        { identifier: 'addr1', success: true, data: '0x123' },
        { identifier: 'addr2', success: true, data: '0x456' },
      ])

      const results = await Web3BatchHelper.callRpcMethod(method, batchParams, NetworksEnum.ethereumMainnet)

      expect(executeBatchStub.calledOnce).to.be.true
      expect(executeBatchStub.firstCall.args[0]).to.deep.equal([
        { method, params: ['0x123', 'latest'], identifier: 'addr1' },
        { method, params: ['0x456', 'latest'], identifier: 'addr2' },
      ])
      expect(results).to.have.length(2)
    })
  })

  describe('getBlocksTimestamps', () => {
    it('should return empty object if from > to', async () => {
      const result = await Web3BatchHelper.getBlocksTimestamps(100, 99, NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({})
    })

    it('should get block timestamps in batch', async () => {
      const callRpcMethodStub = sandbox.stub(Web3BatchHelper, 'callRpcMethod').resolves([
        {
          identifier: 100,
          success: true,
          data: { timestamp: '0x61c04d60' },
        },
        {
          identifier: 101,
          success: true,
          data: { timestamp: '0x61c04d70' },
        },
      ])

      const results = await Web3BatchHelper.getBlocksTimestamps(100, 101, NetworksEnum.ethereumMainnet)

      expect(callRpcMethodStub.calledOnce).to.be.true
      expect(callRpcMethodStub.firstCall.args[0]).to.equal('eth_getBlockByNumber')

      expect(results).to.deep.equal({
        'ethereum-mainnet-100': 1639992672,
        'ethereum-mainnet-101': 1639992688,
      })
    })

    it('should handle failed block requests gracefully', async () => {
      const callRpcMethodStub = sandbox.stub(Web3BatchHelper, 'callRpcMethod').resolves([
        {
          identifier: 100,
          success: false,
          data: null,
        },
        {
          identifier: 101,
          success: false,
          data: null, // null data
        },
      ])

      const results = await Web3BatchHelper.getBlocksTimestamps(100, 102, NetworksEnum.ethereumMainnet)

      expect(callRpcMethodStub.calledOnce).to.be.true
      expect(results).to.deep.equal({})
    })

    it('should handle errors in getBlocksTimestamps and return empty object', async () => {
      // Make callRpcMethod throw an error
      sandbox.stub(Web3BatchHelper, 'callRpcMethod').throws(new Error('RPC error'))

      const results = await Web3BatchHelper.getBlocksTimestamps(100, 101, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({})
    })
  })

  describe('parseBlockNumber', () => {
    it('should parse block number using Web3Helper', async () => {
      const getChainAdjustedBlockNumberStub = sandbox.stub(Web3Helper, 'getChainAdjustedBlockNumber').resolves(12345)

      const result = await Web3BatchHelper.parseBlockNumber(NetworksEnum.ethereumMainnet, 10000)

      expect(getChainAdjustedBlockNumberStub.calledWith(10000, NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal(12345)
    })
  })

  describe('getVotingPowerAndBalancesInBatch', () => {
    it('should return empty object if params are empty', async () => {
      const result = await Web3BatchHelper.getVotingPowerAndBalancesInBatch([], NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({})
    })

    it('should get voting power and balances in batch', async () => {
      const mockParams = [
        {
          memberAddress: '0x123',
          tokenAddress: '0xtoken',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      ]

      const parseBlockNumberStub = sandbox.stub(Web3BatchHelper, 'parseBlockNumber').resolves(1000)
      const encodeFunctionStub = sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')

      const ethCallStub = sandbox.stub(Web3BatchHelper, 'ethCall')
      ethCallStub.onFirstCall().resolves([
        { identifier: '0x123_0_bn', success: true, data: '0xdata1' },
        { identifier: '0x123_0_ts', success: true, data: '0xdata2' },
      ])
      ethCallStub.onSecondCall().resolves([{ identifier: '0x123_0', success: true, data: '0xdata3' }])

      const decodeResultStub = sandbox.stub(Web3BatchHelper, 'decodeResult')
      decodeResultStub.onFirstCall().returns([100n])
      decodeResultStub.onSecondCall().returns([200n])

      const results = await Web3BatchHelper.getVotingPowerAndBalancesInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(parseBlockNumberStub.calledOnce).to.be.true
      expect(encodeFunctionStub.calledThrice).to.be.true
      expect(ethCallStub.calledTwice).to.be.true
      expect(decodeResultStub.calledTwice).to.be.true
      expect(results).to.deep.equal({
        '0x123': {
          balance: '200',
          votingPower: '100',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      })
    })

    it('should handle errors and return zero values', async () => {
      const mockParams = [
        {
          memberAddress: '0x123',
          tokenAddress: '0xtoken',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      ]

      sandbox.stub(Web3BatchHelper, 'parseBlockNumber').throws(new Error('Test error'))

      const results = await Web3BatchHelper.getVotingPowerAndBalancesInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0x123': {
          balance: '0',
          votingPower: '0',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      })
    })

    it('should prioritize timestamp voting power over block number', async () => {
      const mockParams = [
        {
          memberAddress: '0x123',
          tokenAddress: '0xtoken',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      ]

      sandbox.stub(Web3BatchHelper, 'parseBlockNumber').resolves(1000)
      sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')

      const ethCallStub = sandbox.stub(Web3BatchHelper, 'ethCall')
      // The first call returns voting power results (both block number and timestamp)
      ethCallStub.onFirstCall().resolves([
        { identifier: '0x123_0_bn', success: true, data: '0xdata1' },
        { identifier: '0x123_0_ts', success: true, data: '0xdata2' },
      ])
      // Second call returns balance result
      ethCallStub.onSecondCall().resolves([{ identifier: '0x123_0', success: true, data: '0xdata3' }])

      const decodeResultStub = sandbox.stub(Web3BatchHelper, 'decodeResult')

      decodeResultStub.onCall(0).returns([110]) // timestamp voting power result
      decodeResultStub.onCall(1).returns([120]) // balance result
      decodeResultStub.onCall(2).returns([150]) // block number voting power result

      const results = await Web3BatchHelper.getVotingPowerAndBalancesInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0x123': {
          balance: '120',
          votingPower: '110',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      })
    })

    it('should fallback to block number voting power when timestamp fails', async () => {
      const mockParams = [
        {
          memberAddress: '0x123',
          tokenAddress: '0xtoken',
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      ]

      sandbox.stub(Web3BatchHelper, 'parseBlockNumber').resolves(1000)
      sandbox.stub(Web3BatchHelper, 'encodeFunction').returns('0xencoded')

      const ethCallStub = sandbox.stub(Web3BatchHelper, 'ethCall')
      // First call returns voting power results (block number succeeds, timestamp fails)
      ethCallStub.onFirstCall().resolves([
        { identifier: '0x123_0_bn', success: true, data: '0xdata1' },
        { identifier: '0x123_0_ts', success: false, data: null },
      ])
      // Second call returns balance result
      ethCallStub.onSecondCall().resolves([{ identifier: '0x123_0', success: true, data: '0xdata3' }])

      const decodeResultStub = sandbox.stub(Web3BatchHelper, 'decodeResult')
      decodeResultStub.onCall(0).returns([100n]) // block number voting power result
      decodeResultStub.onCall(1).returns([200n]) // balance result

      const results = await Web3BatchHelper.getVotingPowerAndBalancesInBatch(mockParams, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0x123': {
          balance: '200',
          votingPower: '100', // fallback to block number result
          blockNumber: 1000,
          blockTimestamp: 1640001888,
        },
      })
    })
  })
})
