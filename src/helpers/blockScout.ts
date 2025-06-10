import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import { type ITokenFullDetails } from '@src/types/blockScout'
import Utils from '@helpers/utils'
import { ethers } from 'ethers'

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
  ): Promise<{ transfers: number; holders: string }> => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
    }
    const path = `tokens/${address}/counters`

    try {
      const response = await BlockScoutHelper._rpCall(path, params, network)
      if (response) {
        return {
          transfers: response.transfers_count,
          holders: response.token_holders_count,
        }
      }
    } catch (error) {
      logger.warn('Error getTokenCounters', llo({ error }))
    }

    return { transfers: 0, holders: '0' }
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

  getContractSourceCode: async (address: HexAddress, network: NetworksEnum) => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
    }
    const path = `smart-contracts/${address}`

    try {
      let response = await BlockScoutHelper._rpCall(path, params, network)
      if (response?.source_code === null) {
        const searchDetails = await BlockScoutHelper.searchDetails(address, network)
        if (searchDetails?.is_smart_contract_verified! && searchDetails?.name) {
          response = await BlockScoutHelper._rpCall(path, params, network)
        } else {
          response = null
        }
      }

      if (response?.source_code) {
        return [
          {
            SourceCode: response!.source_code || '',
            ContractName: response!.name,
            ABI: JSON.stringify(response!.abi),
          },
        ]
      }
    } catch (error) {
      logger.warn('Error getContractSourceCode', llo({ error }))
    }

    return null
  },

  getContractProxyDetails: async (address: HexAddress, network: NetworksEnum) => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
      q: address,
    }

    const toReturn = {
      proxy: {
        name: null,
        address: null,
      },
      implementation: {
        name: null,
        address: null,
      },
    }

    try {
      const response = await BlockScoutHelper._rpCall('smart-contracts', params, network)
      if (response?.items.length) {
        const contract = response.items.find((item: any) => item.address.hash === address)
        if (contract) {
          if (contract.address.implementations.length) {
            toReturn.implementation = {
              name: contract.address.implementations[0].name,
              address: contract.address.implementations[0].hash,
            }
            toReturn.proxy = {
              name: contract.address.name,
              address: contract.address.hash,
            }
            return toReturn
          }
          toReturn.implementation = {
            name: contract.address.name,
            address: contract.address.hash,
          }
          return toReturn
        }
      }
    } catch (error) {
      logger.warn('Error getContractProxy', llo({ error }))
    }

    return toReturn
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

  getTokenHoldersPage: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    page: number = 1,
    pageSize: number = 100,
  ) => {
    const networkConfig = BlockScoutHelper._parseNetworkToConfig(network)
    if (!networkConfig?.BLOCKSCOUT_API_URL) {
      logger.warn('BlockScout API is not configured', llo({ network }))
      return { holders: [], total: 0 }
    }

    const baseUrl = networkConfig.BLOCKSCOUT_API_URL.replace(/\/api\/?$/, '')
    const params = {
      module: 'token',
      action: 'getTokenHolders',
      contractaddress: tokenAddress,
      page,
      offset: pageSize,
      apikey: networkConfig.BLOCKSCOUT_API_KEY,
    }

    try {
      const url = `${baseUrl}/api`
      const response = await retryRequest(async () =>
        BottleneckModule.getBlockScoutLimiter(network).schedule(async () => axios.get(url, { params })),
      )

      const data = response?.data

      if (data?.message === 'OK' && Array.isArray(data?.result) && data.result.length > 0) {
        return {
          holders: data.result.map((item: any) => ({
            address: ethers.getAddress(item.address),
            value: item.value,
          })),
          total: data.result.length,
        }
      }
    } catch (error) {
      logger.error('Error fetching token holders page', llo({ error, page, tokenAddress }))
    }
    return { holders: [], total: 0 }
  },

  async getAllTokenHolders(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    options = {
      pageSize: 100,
      delayMs: 500,
      startPage: 0,
    },
    callback?: (
      holders: Array<{ address: string; value: string }>,
      pageInfo: { currentPage: number; isLastPage: boolean; total: number },
    ) => Promise<void> | void,
  ) {
    try {
      const networkConfig = BlockScoutHelper._parseNetworkToConfig(network)
      if (!networkConfig?.BLOCKSCOUT_API_URL) {
        logger.warn('BlockScout API is not configured', llo({ network }))
        return { holders: [], total: 0, hasMore: false, lastPage: 0 }
      }

      const allHolders: Array<{ address: string; value: string }> = []
      let page = options.startPage || 1
      let hasMoreData = true

      while (hasMoreData) {
        const pageResult = await BlockScoutHelper.getTokenHoldersPage(tokenAddress, network, page, options.pageSize)

        if (!pageResult.holders || pageResult.holders.length === 0) {
          hasMoreData = false
          break
        }

        const isLastPage = pageResult.holders.length < options.pageSize

        if (callback) {
          await callback(pageResult.holders, {
            currentPage: page,
            isLastPage,
            total: pageResult.total,
          })
        }

        allHolders.push(...pageResult.holders)

        if (isLastPage) {
          hasMoreData = false
        } else {
          page++
          await Utils.wait(options.delayMs)
        }
      }

      return {
        holders: allHolders,
        total: allHolders.length,
        hasMore: hasMoreData,
        lastPage: page,
      }
    } catch (error) {
      logger.error('Error getAllTokenHolders', llo({ error, tokenAddress }))
      return { holders: [], total: 0, hasMore: false, lastPage: options.startPage }
    }
  },
}

export default BlockScoutHelper
