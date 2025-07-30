import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import { type ITokenFullDetails } from '@src/types/blockScout'

const llo = logger.logMeta.bind(null, { service: 'helpers:BlockScoutHelper' })

const BlockScoutHelper = {
  axiosInstance: (network: NetworksEnum) =>
    axios.create({
      baseURL: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_URL,
      headers: { 'Content-Type': 'application/json' },
    }),

  _parseNetworkToConfig: (network: NetworksEnum) => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    return config.NODES[networkConfigKey]
  },

  _rpCall: async (path: string, params: object, network: NetworksEnum) => {
    if (!BlockScoutHelper._parseNetworkToConfig(network)?.BLOCKSCOUT_API_URL) {
      logger.warn('BlockScout API is not configured', llo({ network }))
      return null
    }
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getBlockScoutLimiter(network).schedule(async () =>
          BlockScoutHelper.axiosInstance(network).get(`v2/${path}`, { params }),
        ),
      )
      return response?.data
    } catch (error) {
      logger.warn('BLockScoutApi API call', llo({ error, path, params }))
      throw error
    }
  },

  parseTokenType: (type: string): ITokenType => {
    switch (type) {
      case 'ERC-20':
        return ITokenType.ERC20
      case 'ERC-721':
        return ITokenType.ERC721
      case 'ERC-1155':
        return ITokenType.ERC1155
      default:
        return ITokenType.unknown
    }
  },

  getTokenFullDetails: async (address: HexAddress, network: NetworksEnum): Promise<ITokenFullDetails | null> => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
    }
    const path = `tokens/${address}`

    try {
      const response = await BlockScoutHelper._rpCall(path, params, network)
      if (response?.address) {
        return {
          address: response.address,
          name: response.name,
          symbol: response.symbol,
          decimals: response.decimals,
          totalSupply: response.total_supply,
          totalHolders: response.holders,
          logo: response.icon_url,
          priceUsd: response.exchange_rate,
          type: BlockScoutHelper.parseTokenType(response.type),
        }
      }
    } catch (error) {
      logger.warn('Error getTokenDetails', llo({ error }))
    }

    return null
  },

  getTokenCounters: async (
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{ transfers: number; holders: number }> => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
    }
    const path = `tokens/${address}/counters`

    try {
      const response = await BlockScoutHelper._rpCall(path, params, network)
      if (response) {
        return {
          transfers: Number(response.transfers_count),
          holders: Number(response.token_holders_count),
        }
      }
    } catch (error) {
      logger.warn('Error getTokenCounters', llo({ error }))
    }

    return { transfers: 0, holders: 0 }
  },

  searchDetails: async (
    query: string,
    network: NetworksEnum,
  ): Promise<{ is_smart_contract_verified: boolean; name: string; type?: string } | null> => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
      q: query,
    }
    try {
      const response = await BlockScoutHelper._rpCall('search', params, network)
      if (response?.items?.length) {
        return response.items.find((item: any) => item.address === query)
      }
    } catch (error) {
      logger.warn('Error searchDetails', llo({ error }))
    }

    return null
  },

  async getTransactionOfAnAddress(address: HexAddress, network: NetworksEnum) {
    try {
      const params = {
        apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
      }
      const results = await BlockScoutHelper._rpCall(`addresses/${address}/transactions`, params, network)
      if (results?.items?.length) {
        return results.items.map((item: any) => ({ txHash: item.hash, blockNumber: item.block_number }))
      }
    } catch (error) {
      logger.warn('Error getTransactionOfAnAddress', llo({ error }))
    }
  },

  /**
   * Fetch token transfers using Blockscout's native API v2
   * Supports ERC-20, ERC-721, ERC-1155 in a single call
   */
  async _fetchERC20Transfers(address: string, network: NetworksEnum): Promise<any[]> {
    const allTransfers: any[] = []
    let nextPageParams: any = {}

    try {
      const path = `addresses/${address}/token-transfers`
      do {
        const params = {
          type: 'ERC-20,ERC-721,ERC-1155',
          ...(nextPageParams || {}),
          apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
        }

        const response = await BlockScoutHelper._rpCall(path, params, network)
        if (!response?.items || response.items.length === 0) {
          break
        }

        const processedTransfers = response.items
          .filter(
            (transfer: any) =>
              transfer.from.is_scam === false && transfer.to.is_scam === false && transfer.type === 'token_transfer',
          )
          .map((transfer: any) => ({
            hash: transfer.transaction_hash,
            blockNumber: transfer.block_number.toString(),
            timestamp: new Date(transfer.timestamp).getTime() / 1000,
            from: transfer.from.hash,
            to: transfer.to.hash,
            value: transfer.total.value,
            contractAddress: transfer.token.address,
            tokenName: transfer.token.name,
            tokenSymbol: transfer.token.symbol,
            tokenDecimals: transfer.token.decimals,
            logIndex: transfer.log_index,
            category: 'erc20',
            type: 'token_transfer',
          }))

        allTransfers.push(...processedTransfers)
        nextPageParams = response.next_page_params
      } while (nextPageParams)

      return allTransfers
    } catch (error) {
      logger.error('Error fetching token transfers with native API', { error, address, network })
      return []
    }
  },

  /**
   * Fetch ETH transactions using Block scout native API v2
   */
  async _fetchTxList(address: string, network: NetworksEnum): Promise<any[]> {
    const allTransactions: any[] = []
    let nextPageParams: any = null

    try {
      const path = `addresses/${address}/transactions`

      do {
        const params = {
          filter: 'to,from',
          ...(nextPageParams || {}),
          apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
        }

        const response = await BlockScoutHelper._rpCall(path, params, network)

        if (!response?.items || response.items.length === 0) {
          break
        }

        const validTransactions = response.items
          .filter((tx: any) => tx.value && tx.value !== '0' && parseFloat(tx.value) > 0)
          .map((tx: any) => ({
            hash: tx.hash,
            blockNumber: tx.block_number.toString(),
            timestamp: new Date(tx.timestamp).getTime() / 1000,
            from: tx.from.hash,
            to: tx.to.hash,
            value: tx.value,
            contractAddress: null,
            tokenName: null,
            tokenSymbol: null,
            tokenDecimals: '18', // ETH decimals
            transactionIndex: tx.position,
            category: 'external',
            type: 'transaction',
          }))

        allTransactions.push(...validTransactions)
        nextPageParams = response.next_page_params
      } while (nextPageParams)

      return allTransactions
    } catch (error) {
      logger.error('Error fetching ETH transactions with native API', llo({ error, address, network }))
      return []
    }
  },

  /**
   * Fetch internal transactions using Blockscout's native API v2
   */
  async _fetchInternalTxs(address: string, network: NetworksEnum): Promise<any[]> {
    const allInternalTxs: any[] = []
    let nextPageParams: any = null

    try {
      const path = `addresses/${address}/internal-transactions`

      do {
        const params = {
          filter: 'to,from',
          ...(nextPageParams || {}),
          apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
        }

        const response = await BlockScoutHelper._rpCall(path, params, network)

        if (!response?.items || response.items.length === 0) {
          break
        }

        const validInternalTxs = response.items
          .filter((tx: any) => tx.type === 'call' && tx.value && tx.value !== '0' && parseFloat(tx.value) > 0)
          .map((tx: any) => ({
            hash: tx.transaction_hash,
            blockNumber: tx.block_number.toString(),
            timestamp: new Date(tx.timestamp).getTime() / 1000,
            from: tx.from.hash,
            to: tx.to.hash,
            value: tx.value,
            contractAddress: null,
            tokenName: null,
            tokenSymbol: null,
            tokenDecimals: '18', // ETH decimals
            index: tx.index,
            category: 'internal',
            type: 'internal_transaction',
          }))

        allInternalTxs.push(...validInternalTxs)
        nextPageParams = response.next_page_params
      } while (nextPageParams)

      return allInternalTxs
    } catch (error) {
      logger.error('Error fetching internal transactions with native API', llo({ error, address, network }))
      return []
    }
  },

  /**
   * Fetch token balances using Blockscout's native API v2
   * Supports ERC-20, ERC-721, ERC-1155 in a single call
   */
  async getTokenBalances(address: HexAddress, network: NetworksEnum): Promise<any[]> {
    const allTokens: any[] = []
    let nextPageParams: any = null

    try {
      const path = `addresses/${address}/tokens`

      do {
        const params = {
          type: 'ERC-20,ERC-721,ERC-1155',
          ...(nextPageParams || {}),
          apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
        }

        const response = await BlockScoutHelper._rpCall(path, params, network)

        if (!response?.items || response.items.length === 0) {
          break
        }

        const validTokens = response.items
          .filter((item: any) => item.value && item.value !== '0' && parseFloat(item.value) > 0)
          .map((item: any) => ({
            contractAddress: item.token.address,
            tokenBalance: item.value,
            tokenName: item.token.name,
            tokenSymbol: item.token.symbol,
            tokenDecimals: item.token.decimals,
            tokenType: item.token.type,
          }))

        allTokens.push(...validTokens)
        nextPageParams = response.next_page_params
      } while (nextPageParams)

      return allTokens
    } catch (error) {
      logger.error('Error fetching token balances with native API', llo({ error, address, network }))
      return []
    }
  },
}

export default BlockScoutHelper
