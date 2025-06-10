import logger from '@logger'
import axios from 'axios'
import ProviderModule from '@src/modules/provider'
import { ethers } from 'ethers'
import { type NetworksEnum, type HexAddress, type BatchRequestItem, type BatchResponse } from '@src/types'
import Web3Helper from '@helpers/web3'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3BatchHelper' })

const Web3BatchHelper = {
  /**
   * Execute a batch of RPC requests
   * @param requests
   * @param network
   */
  async executeBatch<T>(requests: BatchRequestItem[], network: NetworksEnum): Promise<BatchResponse<T>[]> {
    if (requests.length === 0) return []

    if (requests.length < 900) {
      return this._executeSingleBatch(requests, network)
    }

    const allResults: BatchResponse<T>[] = []

    await Utils.asyncBatchProcess(
      requests,
      async (request: any) => {
        const result = await this._processSingleRequest(request, network)
        allResults.push(result)
      },
      {
        concurrency: 3,
        batchSize: 900,
        onError: (error: any, request: any) => {
          logger.error('RPC request failed', llo({ network, error, method: request.method }))
          allResults.push({
            identifier: request.identifier,
            success: false,
            data: null,
            error,
          })
        },
        stopOnError: false,
      },
    )

    return allResults
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
   * Execute a single batch (up to around 1000 items)
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

      const startTime = Date.now()

      const response = await axios.post(providerUrl!, batchRequests, {
        headers: { 'Content-Type': 'application/json' },
      })

      logger.info(
        'Batch request completed',
        llo({
          network,
          method: requests[0].method,
          requestCount: requests.length,
          duration: Date.now() - startTime,
        }),
      )

      return requests.map((req, index) => {
        const rpcResult = response.data[index]

        if (rpcResult.error) {
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
          data: rpcResult.result as T,
        }
      })
    } catch (error) {
      return requests.map(req => ({
        identifier: req.identifier,
        success: false,
        data: null,
        error,
      }))
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
}

export default Web3BatchHelper
