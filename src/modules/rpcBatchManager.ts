import logger from '@logger'
import axios from 'axios'
import ProviderModule from '@src/modules/provider'
import { ethers } from 'ethers'
import { type NetworksEnum, type HexAddress, type BatchRequestItem, type BatchResponse } from '@src/types'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3BatchHelper' })

class RpcBatchManager {
  private readonly baseUrl: string | null = null
  constructor(url?: string) {
    this.baseUrl = url || null
  }

  /**
   * Get the provider URL - either from custom base URL or ProviderModule
   * @param network - The network to get the provider URL for
   */
  private async getProviderUrl(network: NetworksEnum): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl
    }
    return await ProviderModule.getProviderUrl(network)
  }

  /**
   * Execute a batch of RPC requests with adaptive batching
   * This method automatically reduces batch size when responses are too large
   * @param requests
   * @param network
   */
  async executeBatch<T>(requests: BatchRequestItem[], network: NetworksEnum): Promise<BatchResponse<T>[]> {
    if (requests.length === 0) return []

    return this._executeAdaptiveBatch(requests, network, config.BATCH_REQUEST.DEFAULT_SIZE)
  }

  /**
   * Execute batch with adaptive threshold reduction on errors
   * @param requests All requests to process
   * @param network Network to use
   * @param initialThreshold Starting batch size
   */
  async _executeAdaptiveBatch<T>(
    requests: BatchRequestItem[],
    network: NetworksEnum,
    initialThreshold: number,
  ): Promise<BatchResponse<T>[]> {
    let threshold = initialThreshold
    const allResults: BatchResponse<T>[] = []
    let remainingRequests = [...requests]
    let retryCount = 0
    const maxRetries = 5

    while (remainingRequests.length > 0 && retryCount < maxRetries) {
      const batches = this._createBatches(remainingRequests, threshold)
      const { failedRequests, batchErrors } = await this._processBatchesSequentially(batches, network, allResults)

      if (failedRequests.length === 0) {
        break
      }

      const shouldReduceBatch = this._shouldReduceBatchSize(batchErrors, threshold)

      if (shouldReduceBatch && threshold > 1) {
        threshold = this._reduceThreshold(threshold)
        remainingRequests = failedRequests
        retryCount++
      } else {
        await this._processIndividualRequests(failedRequests, network, allResults)
        remainingRequests = []
      }
    }

    return allResults
  }

  /**
   * Process failed requests individually as a final fallback
   */
  async _processIndividualRequests<T>(
    requests: BatchRequestItem[],
    network: NetworksEnum,
    allResults: BatchResponse<T>[],
  ): Promise<void> {
    for (const request of requests) {
      try {
        const result = await this._executeSingleBatch<T>([request], network)
        allResults.push(...result)
      } catch (error) {
        allResults.push({
          identifier: request.identifier,
          success: false,
          data: null,
          error,
        } satisfies BatchResponse<T>)
      }
    }
  }

  /**
   * Split requests into batches based on the current threshold
   */
  _createBatches(requests: BatchRequestItem[], threshold: number): BatchRequestItem[][] {
    const batches: BatchRequestItem[][] = []
    for (let i = 0; i < requests.length; i += threshold) {
      batches.push(requests.slice(i, i + threshold))
    }
    return batches
  }

  /**
   * Process batches one by one and track results and errors
   */
  async _processBatchesSequentially<T>(
    batches: BatchRequestItem[][],
    network: NetworksEnum,
    allResults: BatchResponse<T>[],
  ): Promise<{ failedRequests: BatchRequestItem[]; batchErrors: Error[] }> {
    const failedRequests: BatchRequestItem[] = []
    const batchErrors: Error[] = []

    for (const batch of batches) {
      try {
        const batchResults = await this._executeSingleBatch<T>(batch, network)
        allResults.push(...batchResults)
      } catch (error) {
        failedRequests.push(...batch)
        batchErrors.push(error as Error)
        logger.info(
          'Entire batch failed',
          llo({
            batchSize: batch.length,
            error: (error as Error).message,
            stack: (error as Error).stack,
          }),
        )
      }
    }

    return { failedRequests, batchErrors }
  }

  /**
   * Determine if we should reduce batch size based on error types
   */
  _shouldReduceBatchSize(errors: Error[], currentThreshold: number): boolean {
    if (errors.length === 0 || currentThreshold <= 1) {
      return false
    }

    return errors.some(error => {
      const message = error.message
      return [
        'The query timed out',
        'timeout',
        'Response size is larger than 150MB limit',
        'Log response size exceeded',
        'Consider reducing your block range',
        'Query returned more than 1000000 results',
        'Cannot create a string longer',
      ].includes(message)
    })
  }

  /**
   * Reduce the batch threshold by half
   */
  _reduceThreshold(currentThreshold: number): number {
    return Math.max(Math.floor(currentThreshold / 2), 1)
  }

  /**
   * Process a single request (used by asyncBatchProcess)
   * @param request
   * @param network
   */
  async _processSingleRequest(request: BatchRequestItem, network: NetworksEnum): Promise<BatchResponse<any>> {
    try {
      const result = await this._executeSingleBatch([request], network)
      return result[0]
    } catch (error) {
      return {
        identifier: request.identifier,
        success: false,
        data: null,
        error,
      }
    }
  }

  /**
   * Execute a single batch (up to specified size)
   * This method is used internally and should not be called directly
   */
  async _executeSingleBatch<T>(requests: BatchRequestItem[], network: NetworksEnum): Promise<BatchResponse<T>[]> {
    try {
      const providerUrl = await this.getProviderUrl(network)

      const batchRequests = requests.map(req => ({
        jsonrpc: '2.0',
        id: Math.random().toString(36).substring(2, 15),
        method: req.method,
        params: req.params,
      }))

      const response = await axios.post(providerUrl, batchRequests, {
        headers: { 'Content-Type': 'application/json' },
      })

      return requests.map((req, index) => {
        const rpcResult = response.data[index]

        if (rpcResult?.error) {
          return {
            identifier: req.identifier,
            success: false,
            data: null,
            error: rpcResult.error,
          }
        }

        return {
          identifier: req.identifier,
          success: true,
          data: rpcResult?.result as T,
        }
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Helper method for encoding function calls
   * @param functionSignature - The function signature (e.g., "transfer(address,uint256)")
   * @param paramTypes - Array of parameter types (e.g., ["address", "uint256"])
   * @param paramValues - Array of parameter values (e.g., ["0x123...", 1000])
   */
  encodeFunction(functionSignature: string, paramTypes: string[], paramValues: any[]): string {
    const functionSelector = '0x' + ethers.keccak256(ethers.toUtf8Bytes(functionSignature)).slice(2, 10)
    const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(paramTypes, paramValues)

    return functionSelector + encodedParams.slice(2)
  }

  /**
   * Helper method for decoding results
   */
  decodeResult<T>(types: string[], data: string): T {
    return ethers.AbiCoder.defaultAbiCoder().decode(types, data) as unknown as T
  }

  /**
   * Convenience method for batch eth_call requests
   */
  async ethCall<T>(
    calls: Array<{
      to: HexAddress
      data: string
      identifier: any
    }>,
    network: NetworksEnum,
    blockTag: string = 'latest',
  ): Promise<BatchResponse<T>[]> {
    const requests = calls.map(call => ({
      method: 'eth_call',
      params: [
        {
          to: call.to,
          data: call.data,
        },
        blockTag,
      ],
      identifier: call.identifier,
    }))

    return this.executeBatch<T>(requests, network)
  }

  /**
   * Generic method for any batch RPC call
   */
  async callRpcMethod<T>(
    method: string,
    batchParams: Array<{ params: any[]; identifier: any }>,
    network: NetworksEnum,
  ): Promise<BatchResponse<T>[]> {
    const requests = batchParams.map(item => ({
      method,
      params: item.params,
      identifier: item.identifier,
    }))

    return this.executeBatch<T>(requests, network)
  }
}

export default RpcBatchManager
