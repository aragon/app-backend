import logger from '@logger'
import { type NetworksEnum, type HexAddress, type AnkrBalanceResult, type AnkrAccountBalance } from '@src/types'
import RpcBatchManager from '@modules/rpcBatchManager'
import Web3Helper from '@helpers/web3'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3BatchHelper' })

const Web3BatchHelper = {
  _getManagerInstance: (url?: string) => {
    return new RpcBatchManager(url)
  },

  async getLockVotingPowerAtInBatch(
    batchParams: Array<{
      escrowAddress: HexAddress
      tokenId: string
      ts: number
    }>,
    network: NetworksEnum,
  ): Promise<Array<{ tokenId: string; votingPower: bigint }>> {
    const manager = Web3BatchHelper._getManagerInstance()

    try {
      const calls = batchParams.map(param => {
        const data = manager.encodeFunction(
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

      const results = await manager.ethCall<string>(calls, network)

      return results.map(result => {
        const tokenId = result.identifier as string

        if (!result.success || !result.data) {
          return { tokenId, votingPower: 0n }
        }

        try {
          const decoded = manager.decodeResult<[bigint]>(['uint256'], result.data)
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
   * Get block timestamps in batch using JSON-RPC batch requests
   */
  async getBlocksTimestamps(from: number, to: number, network: NetworksEnum): Promise<Record<string, number>> {
    if (from > to) {
      return {}
    }

    const manager = Web3BatchHelper._getManagerInstance()

    try {
      const blockNumbers: number[] = []
      for (let blockNum = from; blockNum <= to; blockNum++) {
        blockNumbers.push(blockNum)
      }

      const results = await manager.callRpcMethod<any>(
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
    const manager = Web3BatchHelper._getManagerInstance()
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
            data: manager.encodeFunction(
              'getPastVotes(address,uint256)',
              ['address', 'uint256'],
              [param.memberAddress, blockNumber],
            ),
            identifier: blockNumberCallId,
          })

          votingPowerCalls.push({
            to: param.tokenAddress,
            data: manager.encodeFunction(
              'getPastVotes(address,uint256)',
              ['address', 'uint256'],
              [param.memberAddress, param.blockTimestamp.toString()],
            ),
            identifier: blockTimestampCallId,
          })

          balanceCalls.push({
            to: param.tokenAddress,
            data: manager.encodeFunction('balanceOf(address)', ['address'], [param.memberAddress]),
            identifier: balanceCallId,
          })
        }),
      )

      const [votingPowerResults, balanceResults] = await Promise.all([
        manager.ethCall<string>(votingPowerCalls, network),
        manager.ethCall<string>(balanceCalls, network, `0x${params[0].blockNumber.toString(16)}`),
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
          const decoded = manager.decodeResult<[bigint]>(['uint256'], vpTimestampResult.data)
          votingPower = decoded[0].toString()
        } else if (vpBlockNumResult?.success && vpBlockNumResult.data) {
          const decoded = manager.decodeResult<[bigint]>(['uint256'], vpBlockNumResult.data)
          votingPower = decoded[0].toString()
        }

        if (balResult?.success && balResult.data) {
          const decoded = manager.decodeResult<[bigint]>(['uint256'], balResult.data)
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
   * Get voting power for a specific member at a given block number or timestamp
   * @param memberAddress
   * @param tokenAddress
   * @param blockNumber
   * @param blockTimestamp
   * @param network
   */
  async getMemberVotingPower(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    blockNumber: number,
    blockTimestamp: number,
    network: NetworksEnum,
  ): Promise<{ votingPower: string; error?: boolean }> {
    const manager = Web3BatchHelper._getManagerInstance()
    try {
      blockNumber = await this.parseBlockNumber(network, blockNumber)

      const votingPowerCalls: Array<{
        to: HexAddress
        data: string
        identifier: any
      }> = []

      votingPowerCalls.push({
        to: tokenAddress,
        data: manager.encodeFunction(
          'getPastVotes(address,uint256)',
          ['address', 'uint256'],
          [memberAddress, blockNumber],
        ),
        identifier: `${memberAddress}_votingPower`,
      })

      votingPowerCalls.push({
        to: tokenAddress,
        data: manager.encodeFunction(
          'getPastVotes(address,uint256)',
          ['address', 'uint256'],
          [memberAddress, blockTimestamp],
        ),
        identifier: `${memberAddress}_votingPower_ts`,
      })

      const votingPowerResults = await manager.ethCall<string>(votingPowerCalls, network)
      const vpBlockNumResult = votingPowerResults.find(r => r.identifier === `${memberAddress}_votingPower`)
      const vpTimestampResult = votingPowerResults.find(r => r.identifier === `${memberAddress}_votingPower_ts`)

      let votingPowerFromBlockNumber = '0'
      let votingPowerFromTimestamp = '0'
      let hasBlockNumberResult = false
      let hasTimestampResult = false

      if (vpBlockNumResult?.success && vpBlockNumResult.data) {
        try {
          const decoded = manager.decodeResult<[bigint]>(['uint256'], vpBlockNumResult.data)
          votingPowerFromBlockNumber = decoded[0].toString()
          hasBlockNumberResult = true
        } catch (error) {
          hasBlockNumberResult = false
        }
      }

      if (vpTimestampResult?.success && vpTimestampResult.data) {
        try {
          const decoded = manager.decodeResult<[bigint]>(['uint256'], vpTimestampResult.data)
          votingPowerFromTimestamp = decoded[0].toString()
          hasTimestampResult = true
        } catch (error) {
          hasTimestampResult = false
        }
      }

      if (!hasBlockNumberResult && !hasTimestampResult) {
        return {
          votingPower: '0',
          error: true,
        }
      }

      const votingPower = hasTimestampResult ? votingPowerFromTimestamp : votingPowerFromBlockNumber

      return {
        votingPower,
        error: false,
      }
    } catch (e) {
      return { votingPower: '0', error: true }
    }
  },

  /**
   * Get account balances from Ankr in batch
   * @param walletAddresses Array of wallet addresses to query
   * @param network The network to use for the calls
   * @returns Object with walletAddress as key and balance/TVL/assets info as value
   */
  async getAnkrAccountBalancesInBatch(
    walletAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Record<string, AnkrBalanceResult>> {
    try {
      const ankrParams = await ProviderModule.getAnkrMultichainParams(network)
      const manager = Web3BatchHelper._getManagerInstance(ankrParams.multichainApiUrl)

      const batchParams = walletAddresses.map(address => ({
        params: [
          {
            blockchain: ankrParams.tagName,
            walletAddress: address,
            onlyWhitelisted: false,
            nativeFirst: true,
          },
        ],
        identifier: address,
      }))

      const results = await manager.callRpcMethod<AnkrAccountBalance>('ankr_getAccountBalance', batchParams, network)

      const balances: Record<string, AnkrBalanceResult> = {}

      for (const result of results) {
        const address = result.identifier as HexAddress

        if (!result.success || !result.data) {
          balances[address] = { tvl: '0', assets: [], error: true }
          continue
        }

        try {
          balances[address] = {
            tvl: result.data.totalBalanceUsd || '0',
            assets: result.data.assets || [],
            error: false,
          }
        } catch (error) {
          logger.error('Error processing Ankr balance result', llo({ address, error }))
          balances[address] = { tvl: '0', assets: [], error: true }
        }
      }

      return balances
    } catch (error) {
      logger.error('Error in getAnkrAccountBalancesInBatch', llo({ network, error }))

      const balances: Record<string, AnkrBalanceResult> = {}
      walletAddresses.forEach(address => {
        balances[address] = { tvl: '0', assets: [], error: true }
      })

      return balances
    }
  },
}

export default Web3BatchHelper
