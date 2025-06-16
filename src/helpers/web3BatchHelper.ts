import logger from '@logger'
import axios from 'axios'
import ProviderModule from '@src/modules/provider'
import { ethers } from 'ethers'
import {
  type NetworksEnum,
  type HexAddress,
  type BatchRequestItem,
  type BatchResponse,
  type IWeb3TokenBalance,
} from '@src/types'
import Web3Helper from '@helpers/web3'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3BatchHelper' })

const Web3BatchHelper = {
  /**
   * Execute a batch of RPC requests with adaptive batching
   * This method automatically reduces batch size when responses are too large
   * @param requests
   * @param network
   */
  async executeBatch<T>(requests: BatchRequestItem[], network: NetworksEnum): Promise<BatchResponse<T>[]> {
    if (requests.length === 0) return []

    return this._executeAdaptiveBatch(requests, network, config.BATCH_REQUEST.DEFAULT_SIZE)
  },

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
  },

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
  },

  /**
   * Split requests into batches based on current threshold
   */
  _createBatches(requests: BatchRequestItem[], threshold: number): BatchRequestItem[][] {
    const batches: BatchRequestItem[][] = []
    for (let i = 0; i < requests.length; i += threshold) {
      batches.push(requests.slice(i, i + threshold))
    }
    return batches
  },

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

        const failedInBatch = batch.filter((_req, index) => !batchResults[index]?.success)
        if (failedInBatch.length > 0) {
          logger.info('Failed Batch Stats', llo({ batchSize: batch.length, failedCount: failedInBatch.length }))
        }
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
  },

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
  },

  /**
   * Reduce the batch threshold by half
   */
  _reduceThreshold(currentThreshold: number): number {
    return Math.max(Math.floor(currentThreshold / 2), 1)
  },

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
  },

  /**
   * Execute a single batch (up to specified size)
   * This method is used internally and should not be called directly
   */
  async _executeSingleBatch<T>(requests: BatchRequestItem[], network: NetworksEnum): Promise<BatchResponse<T>[]> {
    try {
      const providerUrl = await ProviderModule.getProviderUrl(network)

      const batchRequests = requests.map(req => ({
        jsonrpc: '2.0',
        id: Math.random().toString(36).substring(2, 15),
        method: req.method,
        params: req.params,
      }))

      const response = await axios.post(providerUrl!, batchRequests, {
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
  },

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
  },

  /**
   * Helper method for decoding results
   */
  decodeResult<T>(types: string[], data: string): T {
    return ethers.AbiCoder.defaultAbiCoder().decode(types, data) as unknown as T
  },

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
  },

  /**
   * Get Voting power and balance of users
   * @param batchParams
   * @param network
   */
  async getLockVotingPowerAtInBatch(
    batchParams: Array<{
      escrowAddress: HexAddress
      tokenId: string
      ts: number
    }>,
    network: NetworksEnum,
  ): Promise<Array<{ tokenId: string; votingPower: bigint }>> {
    if (batchParams.length === 0) return []

    try {
      const calls = batchParams.map(param => {
        const data = this.encodeFunction(
          'votingPowerAt(uint256,uint256)',
          ['uint256', 'uint256'],
          [BigInt(param.tokenId), BigInt(param.ts)],
        )

        return {
          to: param.escrowAddress,
          data,
          identifier: param.tokenId,
        }
      })

      const results = await this.ethCall<string>(calls, network)

      return results.map(result => {
        const tokenId = result.identifier as string

        if (!result.success || !result.data) {
          return { tokenId, votingPower: 0n }
        }

        try {
          const decoded = this.decodeResult<[bigint]>(['uint256'], result.data)
          return { tokenId, votingPower: decoded[0] }
        } catch (error) {
          return { tokenId, votingPower: 0n }
        }
      })
    } catch (error) {
      return batchParams.map(param => ({
        tokenId: param.tokenId,
        votingPower: 0n,
      }))
    }
  },

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
  },

  /**
   * Get block timestamps in batch using JSON-RPC batch requests
   */
  async getBlocksTimestamps(from: number, to: number, network: NetworksEnum): Promise<Record<string, number>> {
    if (from > to) {
      return {}
    }

    try {
      const blockNumbers: number[] = []
      for (let blockNum = from; blockNum <= to; blockNum++) {
        blockNumbers.push(blockNum)
      }

      const results = await this.callRpcMethod<any>(
        'eth_getBlockByNumber',
        blockNumbers.map(blockNumber => ({
          params: [`0x${blockNumber.toString(16)}`, false],
          identifier: blockNumber,
        })),
        network,
      )

      const timestampMap: Record<string, number> = {}

      for (const result of results) {
        if (!result.success || !result.data) continue

        try {
          const blockNumber = result.identifier
          const timestamp = parseInt(result.data.timestamp, 16)
          const key = `${network}-${blockNumber}`
          timestampMap[key] = timestamp
        } catch (parseError) {
          logger.error('Error parsing block data:', llo({ blockNumber: result.identifier, error: parseError }))
        }
      }

      return timestampMap
    } catch (error) {
      logger.error('Error in getBlocksTimestamps', llo({ from, to, network, error }))
      return {}
    }
  },

  async parseBlockNumber(network: NetworksEnum, blockNumber: number): Promise<number> {
    return await Web3Helper.getChainAdjustedBlockNumber(blockNumber, network)
  },

  /**
   * Get voting power and token balances for multiple addresses in batch
   * @param params Array of objects containing memberAddress, tokenAddress, blockNumber
   * @param network The network to use for the calls
   * @returns Object with memberAddress as key and balance/votingPower info as value
   */
  async getVotingPowerAndBalancesInBatch(
    params: Array<{
      memberAddress: HexAddress
      tokenAddress: HexAddress
      blockNumber: number
      blockTimestamp: number
    }>,
    network: NetworksEnum,
  ): Promise<Record<string, { balance: string; votingPower: string; blockNumber: number; blockTimestamp: number }>> {
    if (params.length === 0) return {}

    try {
      const votingPowerCalls: Array<{
        to: HexAddress
        data: string
        identifier: any
      }> = []

      const balanceCalls: Array<{
        to: HexAddress
        data: string
        identifier: any
      }> = []

      await Promise.all(
        params.map(async (param, index) => {
          const blockNumberCallId = `${param.memberAddress}_${index}_bn`
          const blockTimestampCallId = `${param.memberAddress}_${index}_ts`
          const balanceCallId = `${param.memberAddress}_${index}`

          const blockNumber = await this.parseBlockNumber(network, param.blockNumber)

          votingPowerCalls.push({
            to: param.tokenAddress,
            data: this.encodeFunction(
              'getPastVotes(address,uint256)',
              ['address', 'uint256'],
              [param.memberAddress, blockNumber],
            ),
            identifier: blockNumberCallId,
          })

          votingPowerCalls.push({
            to: param.tokenAddress,
            data: this.encodeFunction(
              'getPastVotes(address,uint256)',
              ['address', 'uint256'],
              [param.memberAddress, param.blockTimestamp.toString()],
            ),
            identifier: blockTimestampCallId,
          })

          balanceCalls.push({
            to: param.tokenAddress,
            data: this.encodeFunction('balanceOf(address)', ['address'], [param.memberAddress]),
            identifier: balanceCallId,
          })
        }),
      )

      const [votingPowerResults, balanceResults] = await Promise.all([
        this.ethCall<string>(votingPowerCalls, network),
        this.ethCall<string>(balanceCalls, network, `0x${params[0].blockNumber.toString(16)}`),
      ])

      // Process results
      const results: Record<
        string,
        {
          balance: string
          votingPower: string
          blockNumber: number
          blockTimestamp: number
        }
      > = {}

      params.forEach((param, index) => {
        const blockNumberCallId = `${param.memberAddress}_${index}_bn`
        const blockTimestampCallId = `${param.memberAddress}_${index}_ts`
        const balanceCallId = `${param.memberAddress}_${index}`

        const vpBlockNumResult = votingPowerResults.find(r => r.identifier === blockNumberCallId)
        const vpTimestampResult = votingPowerResults.find(r => r.identifier === blockTimestampCallId)
        const balResult = balanceResults.find(r => r.identifier === balanceCallId)

        let votingPower = '0'
        let balance = '0'

        if (vpTimestampResult?.success && vpTimestampResult.data) {
          const decoded = this.decodeResult<[bigint]>(['uint256'], vpTimestampResult.data)
          votingPower = decoded[0].toString()
        } else if (vpBlockNumResult?.success && vpBlockNumResult.data) {
          const decoded = this.decodeResult<[bigint]>(['uint256'], vpBlockNumResult.data)
          votingPower = decoded[0].toString()
        }

        if (balResult?.success && balResult.data) {
          const decoded = this.decodeResult<[bigint]>(['uint256'], balResult.data)
          balance = decoded[0].toString()
        }

        results[param.memberAddress] = {
          balance,
          votingPower,
          blockNumber: param.blockNumber,
          blockTimestamp: param.blockTimestamp,
        }
      })

      return results
    } catch (error) {
      logger.error('Error in getVotingPowerAndBalancesInBatch', llo({ network, error }))

      const results: Record<
        string,
        {
          balance: string
          votingPower: string
          blockNumber: number
          blockTimestamp: number
        }
      > = {}

      params.forEach(param => {
        results[param.memberAddress] = {
          balance: '0',
          votingPower: '0',
          blockNumber: param.blockNumber,
          blockTimestamp: param.blockTimestamp,
        }
      })

      return results
    }
  },

  /**
   * Get native balances for multiple addresses in batch
   * @param addresses Array of addresses to get balances for
   * @param network The network to use
   * @returns Object with address as key and native balance as value
   */
  async getNativeBalancesInBatch(addresses: HexAddress[], network: NetworksEnum): Promise<Record<string, string>> {
    if (addresses.length === 0) return {}

    try {
      const results = await this.callRpcMethod<string>(
        'eth_getBalance',
        addresses.map(address => ({
          params: [address, 'latest'],
          identifier: address,
        })),
        network,
      )

      const balances: Record<string, string> = {}

      for (const result of results) {
        if (result.success && result.data) {
          // Convert hex to decimal string
          const balance = BigInt(result.data).toString()
          balances[result.identifier] = balance
        } else {
          balances[result.identifier] = '0'
        }
      }

      return balances
    } catch (error) {
      logger.error('Error in getNativeBalancesInBatch', llo({ addresses, network, error }))

      // Return zero balances for all addresses on error
      const balances: Record<string, string> = {}
      addresses.forEach(address => {
        balances[address] = '0'
      })
      return balances
    }
  },

  /**
   * Get token balances for multiple addresses using Alchemy's method
   * Note: alchemy_getTokenBalances doesn't support batching, so we make individual calls
   * @param addresses Array of addresses to get token balances for
   * @param network The network to use
   * @returns Object with address as key and token balances array as value
   */
  async getTokenBalancesInBatch(
    addresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Record<string, IWeb3TokenBalance[]>> {
    if (addresses.length === 0) return {}

    try {
      const providerUrl = await ProviderModule.getProviderUrl(network)
      const tokenBalances: Record<string, IWeb3TokenBalance[]> = {}

      const promises = addresses.map(async address => {
        try {
          const response = await axios.post(
            providerUrl!,
            {
              jsonrpc: '2.0',
              id: Math.random().toString(36).substring(2, 15),
              method: 'alchemy_getTokenBalances',
              params: [address],
            },
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )

          if (response.data?.result) {
            tokenBalances[address] = response.data.result.tokenBalances as IWeb3TokenBalance[]
          } else {
            tokenBalances[address] = []
          }
        } catch (error) {
          logger.error('Error fetching token balances for address', llo({ address, error }))
          tokenBalances[address] = []
        }
      })

      await Promise.all(promises)
      return tokenBalances
    } catch (error) {
      logger.error('Error in getTokenBalancesInBatch', llo({ addresses, network, error }))

      const tokenBalances: Record<string, IWeb3TokenBalance[]> = {}
      addresses.forEach(address => {
        tokenBalances[address] = []
      })
      return tokenBalances
    }
  },

  /**
   * Get DAO assets (native balance + token balances) for multiple addresses
   * Native balances are fetched in batch, token balances individually
   * @param addresses Array of DAO addresses
   * @param network The network to use
   * @returns Object with address as key and assets info as value
   */
  async getDaoAssetsInBatch(
    addresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Record<string, { nativeBalance: string; tokenBalances: IWeb3TokenBalance[] }>> {
    if (addresses.length === 0) return {}

    try {
      const [nativeBalances, tokenBalances] = await Promise.all([
        this.getNativeBalancesInBatch(addresses, network),
        this.getTokenBalancesInBatch(addresses, network),
      ])

      const results: Record<string, { nativeBalance: string; tokenBalances: IWeb3TokenBalance[] }> = {}

      addresses.forEach(address => {
        results[address] = {
          nativeBalance: nativeBalances[address] || '0',
          tokenBalances: tokenBalances[address] || [],
        }
      })

      return results
    } catch (error) {
      logger.error('Error in getDaoAssetsInBatch', llo({ addresses, network, error }))

      const results: Record<string, { nativeBalance: string; tokenBalances: IWeb3TokenBalance[] }> = {}
      addresses.forEach(address => {
        results[address] = {
          nativeBalance: '0',
          tokenBalances: [],
        }
      })
      return results
    }
  },
}

export default Web3BatchHelper
