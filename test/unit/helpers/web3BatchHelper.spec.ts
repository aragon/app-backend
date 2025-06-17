import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
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

    it('should delegate to _executeAdaptiveBatch with default threshold', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
      ]

      const executeAdaptiveBatchStub = sandbox
        .stub(Web3BatchHelper, '_executeAdaptiveBatch')
        .resolves([{ identifier: 'test1', success: true, data: 'result1' }])

      const results = await Web3BatchHelper.executeBatch(mockRequests, NetworksEnum.ethereumMainnet)

      expect(executeAdaptiveBatchStub.calledOnce).to.be.true
      expect(executeAdaptiveBatchStub.firstCall.args[0]).to.equal(mockRequests)
      expect(executeAdaptiveBatchStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
      expect(executeAdaptiveBatchStub.firstCall.args[2]).to.equal(500)
      expect(results).to.have.length(1)
    })
  })

  describe('_executeAdaptiveBatch', () => {
    it('should process all requests successfully in one batch', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
        { method: 'eth_call', params: [{ to: '0x456', data: '0xdef' }, 'latest'], identifier: 'test2' },
      ]

      const createBatchesStub = sandbox.stub(Web3BatchHelper, '_createBatches').returns([mockRequests])
      const processBatchesStub = sandbox.stub(Web3BatchHelper, '_processBatchesSequentially').resolves({
        failedRequests: [],
        batchErrors: [],
      })

      const results = await Web3BatchHelper._executeAdaptiveBatch(mockRequests, NetworksEnum.ethereumMainnet, 500)

      expect(createBatchesStub.calledOnce).to.be.true
      expect(processBatchesStub.calledOnce).to.be.true
      expect(results).to.deep.equal([])
    })

    it('should reduce batch size on retryable errors', async () => {
      const mockRequests = Array.from({ length: 10 }, (_, i) => ({
        method: 'eth_call',
        params: [{ to: '0x123', data: '0xabc' }, 'latest'],
        identifier: `test${i}`,
      }))

      const createBatchesStub = sandbox.stub(Web3BatchHelper, '_createBatches')
      createBatchesStub.onFirstCall().returns([mockRequests])
      createBatchesStub.onSecondCall().returns([mockRequests.slice(0, 5), mockRequests.slice(5)])

      const processBatchesStub = sandbox.stub(Web3BatchHelper, '_processBatchesSequentially')
      processBatchesStub.onFirstCall().resolves({
        failedRequests: mockRequests,
        batchErrors: [new Error('timeout')],
      })
      processBatchesStub.onSecondCall().resolves({
        failedRequests: [],
        batchErrors: [],
      })

      const shouldReduceBatchStub = sandbox.stub(Web3BatchHelper, '_shouldReduceBatchSize').returns(true)
      const reduceThresholdStub = sandbox.stub(Web3BatchHelper, '_reduceThreshold').returns(250)

      await Web3BatchHelper._executeAdaptiveBatch(mockRequests, NetworksEnum.ethereumMainnet, 500)

      expect(createBatchesStub.calledTwice).to.be.true
      expect(shouldReduceBatchStub.calledOnce).to.be.true
      expect(reduceThresholdStub.calledOnce).to.be.true
    })

    it('should process individual requests when batch size cannot be reduced', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
      ]

      sandbox.stub(Web3BatchHelper, '_createBatches').returns([mockRequests])
      sandbox.stub(Web3BatchHelper, '_processBatchesSequentially').resolves({
        failedRequests: mockRequests,
        batchErrors: [new Error('Network error')],
      })
      sandbox.stub(Web3BatchHelper, '_shouldReduceBatchSize').returns(false)
      const processIndividualStub = sandbox.stub(Web3BatchHelper, '_processIndividualRequests').resolves()

      await Web3BatchHelper._executeAdaptiveBatch(mockRequests, NetworksEnum.ethereumMainnet, 1)

      expect(processIndividualStub.calledOnce).to.be.true
    })

    it('should respect max retries limit', async () => {
      const mockRequests = [
        { method: 'eth_call', params: [{ to: '0x123', data: '0xabc' }, 'latest'], identifier: 'test1' },
      ]

      sandbox.stub(Web3BatchHelper, '_createBatches').returns([mockRequests])
      sandbox.stub(Web3BatchHelper, '_processBatchesSequentially').resolves({
        failedRequests: mockRequests,
        batchErrors: [new Error('timeout')],
      })
      sandbox.stub(Web3BatchHelper, '_shouldReduceBatchSize').returns(true)
      sandbox.stub(Web3BatchHelper, '_reduceThreshold').returns(250)

      const results = await Web3BatchHelper._executeAdaptiveBatch(mockRequests, NetworksEnum.ethereumMainnet, 500)

      expect(results).to.deep.equal([])
    })
  })

  describe('_createBatches', () => {
    it('should split requests into batches of specified size', () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        method: 'eth_call',
        params: [],
        identifier: i,
      }))

      const batches = Web3BatchHelper._createBatches(requests, 3)

      expect(batches).to.have.length(4)
      expect(batches[0]).to.have.length(3)
      expect(batches[1]).to.have.length(3)
      expect(batches[2]).to.have.length(3)
      expect(batches[3]).to.have.length(1)
    })
  })

  describe('_processBatchesSequentially', () => {
    it('should process all batches successfully', async () => {
      const batch1 = [{ method: 'eth_call', params: [], identifier: 'test1' }]
      const batch2 = [{ method: 'eth_call', params: [], identifier: 'test2' }]
      const batches = [batch1, batch2]
      const allResults: any[] = []

      const executeSingleBatchStub = sandbox.stub(Web3BatchHelper, '_executeSingleBatch')
      executeSingleBatchStub.onFirstCall().resolves([{ identifier: 'test1', success: true, data: 'result1' }])
      executeSingleBatchStub.onSecondCall().resolves([{ identifier: 'test2', success: true, data: 'result2' }])

      const result = await Web3BatchHelper._processBatchesSequentially(
        batches,
        NetworksEnum.ethereumMainnet,
        allResults,
      )

      expect(result.failedRequests).to.have.length(0)
      expect(result.batchErrors).to.have.length(0)
      expect(allResults).to.have.length(2)
    })

    it('should handle batch execution failures', async () => {
      const batch1 = [{ method: 'eth_call', params: [], identifier: 'test1' }]
      const batches = [batch1]
      const allResults: any[] = []

      const error = new Error('Batch failed')
      sandbox.stub(Web3BatchHelper, '_executeSingleBatch').rejects(error)

      const result = await Web3BatchHelper._processBatchesSequentially(
        batches,
        NetworksEnum.ethereumMainnet,
        allResults,
      )

      expect(result.failedRequests).to.deep.equal(batch1)
      expect(result.batchErrors).to.deep.equal([error])
      expect(allResults).to.have.length(0)
    })
  })

  describe('_shouldReduceBatchSize', () => {
    it('should return true for timeout errors', () => {
      const errors = [new Error('timeout')]
      const result = Web3BatchHelper._shouldReduceBatchSize(errors, 100)
      expect(result).to.be.true
    })

    it('should return true for large response errors', () => {
      const errors = [new Error('Response size is larger than 150MB limit')]
      const result = Web3BatchHelper._shouldReduceBatchSize(errors, 100)
      expect(result).to.be.true
    })

    it('should return false for other errors', () => {
      const errors = [new Error('Network error')]
      const result = Web3BatchHelper._shouldReduceBatchSize(errors, 100)
      expect(result).to.be.false
    })

    it('should return false when threshold is 1', () => {
      const errors = [new Error('timeout')]
      const result = Web3BatchHelper._shouldReduceBatchSize(errors, 1)
      expect(result).to.be.false
    })
  })

  describe('_reduceThreshold', () => {
    it('should reduce threshold by half', () => {
      const result = Web3BatchHelper._reduceThreshold(100)
      expect(result).to.equal(50)
    })

    it('should not go below 1', () => {
      const result = Web3BatchHelper._reduceThreshold(1)
      expect(result).to.equal(1)
    })
  })

  describe('_processIndividualRequests', () => {
    it('should process each request individually', async () => {
      const requests = [
        { method: 'eth_call', params: [], identifier: 'test1' },
        { method: 'eth_call', params: [], identifier: 'test2' },
      ]
      const allResults: any[] = []

      const executeSingleBatchStub = sandbox.stub(Web3BatchHelper, '_executeSingleBatch')
      executeSingleBatchStub.onFirstCall().resolves([{ identifier: 'test1', success: true, data: 'result1' }])
      executeSingleBatchStub.onSecondCall().resolves([{ identifier: 'test2', success: true, data: 'result2' }])

      await Web3BatchHelper._processIndividualRequests(requests, NetworksEnum.ethereumMainnet, allResults)

      expect(allResults).to.have.length(2)
      expect(executeSingleBatchStub.calledTwice).to.be.true
    })

    it('should handle individual request failures', async () => {
      const requests = [{ method: 'eth_call', params: [], identifier: 'test1' }]
      const allResults: any[] = []

      const error = new Error('Request failed')
      sandbox.stub(Web3BatchHelper, '_executeSingleBatch').rejects(error)

      await Web3BatchHelper._processIndividualRequests(requests, NetworksEnum.ethereumMainnet, allResults)

      expect(allResults).to.have.length(1)
      expect(allResults[0]).to.deep.equal({
        identifier: 'test1',
        success: false,
        data: null,
        error,
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

      try {
        await Web3BatchHelper._executeSingleBatch(mockRequests, NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown error')
      } catch (error) {
        expect(error).to.equal(axiosError)
      }
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

  describe('getNativeBalancesInBatch', () => {
    it('should return empty object if addresses array is empty', async () => {
      const result = await Web3BatchHelper.getNativeBalancesInBatch([], NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({})
    })

    it('should get native balances in batch', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']

      const callRpcMethodStub = sandbox.stub(Web3BatchHelper, 'callRpcMethod').resolves([
        { identifier: '0xaddress1', success: true, data: '0x64' }, // 100 in hex
        { identifier: '0xaddress2', success: true, data: '0xc8' }, // 200 in hex
      ])

      const results = await Web3BatchHelper.getNativeBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(callRpcMethodStub.calledOnce).to.be.true
      expect(callRpcMethodStub.firstCall.args[0]).to.equal('eth_getBalance')
      expect(callRpcMethodStub.firstCall.args[1]).to.deep.equal([
        { params: ['0xaddress1', 'latest'], identifier: '0xaddress1' },
        { params: ['0xaddress2', 'latest'], identifier: '0xaddress2' },
      ])
      expect(results).to.deep.equal({
        '0xaddress1': '100',
        '0xaddress2': '200',
      })
    })

    it('should handle failed requests and return zero balances', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']

      const callRpcMethodStub = sandbox.stub(Web3BatchHelper, 'callRpcMethod').resolves([
        { identifier: '0xaddress1', success: true, data: '0x64' },
        { identifier: '0xaddress2', success: false, data: null },
      ])

      const results = await Web3BatchHelper.getNativeBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(callRpcMethodStub.calledOnce).to.be.true
      expect(results).to.deep.equal({
        '0xaddress1': '100',
        '0xaddress2': '0',
      })
    })

    it('should handle errors and return zero balances for all addresses', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']

      sandbox.stub(Web3BatchHelper, 'callRpcMethod').throws(new Error('RPC error'))

      const results = await Web3BatchHelper.getNativeBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0xaddress1': '0',
        '0xaddress2': '0',
      })
    })
  })

  describe('getTokenBalancesInBatch', () => {
    it('should return empty object if addresses array is empty', async () => {
      const result = await Web3BatchHelper.getTokenBalancesInBatch([], NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({})
    })

    it('should get token balances for multiple addresses', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']
      const mockTokenBalances1 = [
        { contractAddress: '0xtoken1', tokenBalance: '0x64' },
        { contractAddress: '0xtoken2', tokenBalance: '0xc8' },
      ]
      const mockTokenBalances2 = [{ contractAddress: '0xtoken3', tokenBalance: '0x12c' }]

      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')

      const axiosPostStub = sandbox.stub(axios, 'post')
      axiosPostStub.onFirstCall().resolves({
        data: { result: { tokenBalances: mockTokenBalances1 } },
      })
      axiosPostStub.onSecondCall().resolves({
        data: { result: { tokenBalances: mockTokenBalances2 } },
      })

      const results = await Web3BatchHelper.getTokenBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(axiosPostStub.calledTwice).to.be.true

      expect(results).to.deep.equal({
        '0xaddress1': mockTokenBalances1,
        '0xaddress2': mockTokenBalances2,
      })
    })

    it('should handle RPC errors for individual addresses', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']
      const mockTokenBalances = [{ contractAddress: '0xtoken1', tokenBalance: '0x64' }]

      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')

      const axiosPostStub = sandbox.stub(axios, 'post')
      axiosPostStub.onFirstCall().resolves({
        data: { result: { tokenBalances: mockTokenBalances } },
      })
      axiosPostStub.onSecondCall().rejects(new Error('RPC error'))

      const results = await Web3BatchHelper.getTokenBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0xaddress1': mockTokenBalances,
        '0xaddress2': [],
      })
    })

    it('should handle missing result in response', async () => {
      const mockAddresses = ['0xaddress1']

      sandbox.stub(ProviderModule, 'getProviderUrl').resolves('https://mock-rpc.example.com')

      const axiosPostStub = sandbox.stub(axios, 'post')
      axiosPostStub.onFirstCall().resolves({
        data: {}, // No result field
      })

      const results = await Web3BatchHelper.getTokenBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0xaddress1': [],
      })
    })

    it('should handle errors and return empty arrays for all addresses', async () => {
      const mockAddresses = ['0xaddress1', '0xaddress2']

      sandbox.stub(ProviderModule, 'getProviderUrl').throws(new Error('Provider error'))

      const results = await Web3BatchHelper.getTokenBalancesInBatch(mockAddresses, NetworksEnum.ethereumMainnet)

      expect(results).to.deep.equal({
        '0xaddress1': [],
        '0xaddress2': [],
      })
    })
  })
})
