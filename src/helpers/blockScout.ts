import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { type ITokenFullDetails } from '@src/types/blockScout'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import axios from 'axios'

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
      if (response?.address_hash || response?.address) {
        return {
          address: response?.address_hash ?? response.address,
          name: response.name,
          symbol: response.symbol,
          decimals: response.decimals,
          totalSupply: response.total_supply,
          totalHolders: response.holders_count ?? response.holders,
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
