import logger from '@logger'
import {
  type NetworksEnum,
  type IBatchRequestConfig,
  type IRPCRequest,
  type IRPCResponse,
  type IBatchProcessingResult,
} from '@types'
import ProviderModule from '@modules/provider'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import axios, { type AxiosResponse } from 'axios'
import type { TopicFilter } from 'ethers'
import { CrawlerErrorHandler } from './crawlerErrorHandler'

// Types are now imported from @types/crawler.ts

/**
 * Manages batch RPC requests for blockchain log fetching
 *
 * Key responsibilities:
 * - Creates and executes JSON-RPC batch requests for eth_getLogs
 * - Handles both simple topic hashes and complex topic filters
 * - Manages request chunking to stay within RPC limits
 * - Integrates with rate limiting (Bottleneck) and retry logic
 * - Processes batch responses and categorizes errors
 *
 * Performance optimizations:
 * - Chunks topics into groups of 4 for batch processing
 * - Uses rate limiting to prevent overwhelming RPC nodes
 * - Implements retry logic with exponential backoff
 * - Identifies batch size and rate limit errors for adaptive handling
 */
export class BatchRequestManager {
  private readonly network: NetworksEnum
  private readonly address?: string | string[]
  private readonly isTopicObject: boolean
  private readonly errorHandler: CrawlerErrorHandler

  constructor(config: IBatchRequestConfig) {
    this.network = config.network
    this.address = config.address
    this.isTopicObject = config.isTopicObject ?? false
    this.errorHandler = new CrawlerErrorHandler()
  }

  /**
   * Get the RPC provider URL for the network
   */
  getProviderUrl(): string | undefined {
    return ProviderModule.getProviderUrl(this.network)
  }

  /**
   * Execute batch request for fetching logs
   *
   * This is the main entry point for fetching logs. It handles two scenarios:
   * 1. Topic filter objects: Complex filters like [transferTopic, null, specificAddress]
   * 2. Regular topic arrays: Simple topic hashes that get chunked for batch processing
   *
   * @param topics - Either an array of topic hashes or a TopicFilter object
   * @param currentBlock - Starting block number (inclusive)
   * @param toBlock - Ending block number (inclusive)
   * @returns Array of RPC responses (may contain both successes and errors)
   * @throws Error if provider URL not found or non-batch-size errors occur
   */
  async executeBatchRequest(
    topics: string[] | TopicFilter,
    currentBlock: number,
    toBlock: number,
  ): Promise<IRPCResponse[]> {
    try {
      const url = this.getProviderUrl()
      if (!url) {
        throw new Error(`Provider URL not found for network: ${this.network}`)
      }

      // Handle topic filter objects (like [transferTopic, null, daoAddress])
      if (this.isTopicObject) {
        return await this.executeTopicObjectRequest(topics as TopicFilter, currentBlock, toBlock, url)
      }

      // Handle regular topic hashes (chunk them for batch processing)
      return await this.executeRegularTopicRequest(topics as string[], currentBlock, toBlock, url)
    } catch (error: any) {
      // Return batch size errors as a response for adaptive handling
      // This allows the crawler to reduce batch size and retry
      if (this.errorHandler.isBatchSizeError(error)) {
        return [{ error }] as IRPCResponse[]
      }

      // Log and re-throw other errors
      logger.warn('error executeBatchRequest', {
        error,
        topics,
        currentBlock,
        toBlock,
        network: this.network,
      })
      throw error
    }
  }

  /**
   * Execute request for topic filter objects
   *
   * Handles complex topic filters where specific positions matter.
   * Example: [transferTopic, null, daoAddress] matches transfers TO the DAO
   *
   * @param topics - TopicFilter object with positional topic matching
   * @param currentBlock - Starting block number
   * @param toBlock - Ending block number
   * @param url - RPC provider URL
   * @returns Array of RPC responses
   */
  private async executeTopicObjectRequest(
    topics: TopicFilter,
    currentBlock: number,
    toBlock: number,
    url: string,
  ): Promise<IRPCResponse[]> {
    const requestId = Math.random().toString(36).substring(2, 15)
    const batchRequests: IRPCRequest[] = [
      {
        jsonrpc: '2.0',
        id: requestId,
        method: 'eth_getLogs',
        params: [
          {
            fromBlock: `0x${currentBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            address: this.address,
            topics, // Pass the topics array as-is for complex filtering
          },
        ],
      },
    ]

    // Execute with retry logic and rate limiting
    const response: AxiosResponse = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(this.network).schedule(async () =>
        axios.post(url, batchRequests, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    return Array.isArray(response.data) ? response.data : ([response.data] as IRPCResponse[])
  }

  /**
   * Execute request for regular topic hashes with chunking
   *
   * Topics are chunked into groups of 4 to optimize batch processing.
   * Each chunk becomes a separate eth_getLogs request in the batch.
   * This balances between request efficiency and RPC limits.
   *
   * @param topics - Array of topic hashes to search for
   * @param currentBlock - Starting block number
   * @param toBlock - Ending block number
   * @param url - RPC provider URL
   * @returns Array of RPC responses (one per chunk)
   */
  private async executeRegularTopicRequest(
    topics: string[],
    currentBlock: number,
    toBlock: number,
    url: string,
  ): Promise<IRPCResponse[]> {
    // Chunk topics into groups of 4 for optimal batch processing
    const topicChunk = utils.chunkArray(topics, 4)
    const batchRequests = topicChunk.reduce((req: IRPCRequest[], chunk: string[]) => {
      const requestId = Math.random().toString(36).substring(2, 15)
      req.push({
        jsonrpc: '2.0',
        id: requestId,
        method: 'eth_getLogs',
        params: [
          {
            fromBlock: `0x${currentBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            address: this.address,
            topics: [chunk],
          },
        ],
      })
      return req
    }, [])

    // Execute with retry logic and rate limiting
    const response: AxiosResponse = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(this.network).schedule(async () =>
        axios.post(url, batchRequests, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    return Array.isArray(response.data) ? response.data : ([response.data] as IRPCResponse[])
  }

  /**
   * Create batch requests for block receipts
   *
   * Block receipts contain all transaction receipts for a block.
   * This is used as an alternative to eth_getLogs when we need
   * comprehensive event data or when dealing with specific edge cases.
   *
   * @param fromBlock - Starting block number (inclusive)
   * @param toBlock - Ending block number (inclusive)
   * @returns Array of RPC requests for eth_getBlockReceipts
   */
  createBlockReceiptsRequests(fromBlock: number, toBlock: number): IRPCRequest[] {
    const requests: IRPCRequest[] = []
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      const blockHex = `0x${blockNum.toString(16)}`
      requests.push({
        jsonrpc: '2.0',
        id: `block-${blockNum}`,
        method: 'eth_getBlockReceipts',
        params: [blockHex],
      })
    }
    return requests
  }

  /**
   * Execute block receipts batch request
   *
   * Fetches complete block receipts which include all logs from all
   * transactions in the specified blocks. More comprehensive but
   * also more data-intensive than eth_getLogs.
   *
   * @param requests - Array of eth_getBlockReceipts requests
   * @returns Axios response containing batch results
   * @throws Error if provider URL not found
   */
  async executeBlockReceiptsRequest(requests: IRPCRequest[]): Promise<AxiosResponse> {
    const url = this.getProviderUrl()
    if (!url) {
      throw new Error(`Provider URL not found for network: ${this.network}`)
    }

    return await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(this.network).schedule(async () =>
        axios.post(url, requests, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  }

  /**
   * Process batch response and categorize by error type
   *
   * Analyzes batch responses to identify:
   * - Successful responses (have result field)
   * - Failed responses (have error field)
   * - Batch size errors (for adaptive batch sizing)
   * - Rate limit errors (for backoff strategies)
   *
   * This categorization enables intelligent error handling and
   * adaptive behavior in the crawler.
   *
   * @param response - Array of RPC responses from batch request
   * @returns Categorized responses for different handling strategies
   */
  processBatchResponse(response: IRPCResponse[]): IBatchProcessingResult {
    const failedResponses = response.filter((resp: IRPCResponse) => resp.error)
    const successfulResponses = response.filter((resp: IRPCResponse) => !resp.error)
    const batchSizeErrors = failedResponses.filter((resp: IRPCResponse) =>
      this.errorHandler.isBatchSizeError(resp.error),
    )
    const rateLimitErrors = failedResponses.filter((resp: IRPCResponse) => this.errorHandler.isRateLimited(resp.error))

    return {
      successfulResponses,
      failedResponses,
      batchSizeErrors,
      rateLimitErrors,
    }
  }

  /**
   * Extract logs from successful responses
   *
   * Flattens the results from multiple successful RPC responses
   * into a single array of log entries.
   *
   * @param responses - Array of successful RPC responses
   * @returns Flattened array of log entries
   */
  extractLogs(responses: IRPCResponse[]): any[] {
    return responses.flatMap((resp: IRPCResponse) => resp.result || [])
  }

  /**
   * Format logs with proper number conversion
   *
   * Converts hexadecimal values from RPC responses to numbers.
   * RPC returns values like blockNumber as hex strings (e.g., "0x1234"),
   * this method converts them to decimal numbers for easier processing.
   *
   * @param logs - Array of raw log entries from RPC
   * @returns Array of formatted logs with numeric values
   */
  formatLogs(logs: any[]): any[] {
    return logs.map((log: any) => ({
      ...log,
      blockNumber: Number(log.blockNumber),
      transactionIndex: Number(log.transactionIndex),
      index: Number(log.logIndex),
    }))
  }
}
