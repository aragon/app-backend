import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import { type ITokenFullDetails } from '@src/types/blockScout'
import Utils from '@helpers/utils'

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

  async getAllTokenHolders(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    options = {
      pageSize: 100,
      maxPages: 100,
      delayMs: 500,
    },
    callback?: (holder: { address: string; value: string }) => Promise<void> | void,
  ) {
    try {
      const networkConfig = BlockScoutHelper._parseNetworkToConfig(network)
      if (!networkConfig?.BLOCKSCOUT_API_URL) {
        logger.warn('BlockScout API is not configured', llo({ network }))
        return { holders: [], total: 0, hasMore: false }
      }

      const baseUrl = networkConfig.BLOCKSCOUT_API_URL.replace(/\/api\/?$/, '')
      const allHolders: Array<{ address: string; value: string }> = []
      let page = 1
      let hasMoreData = true

      while (hasMoreData && page <= options.maxPages) {
        const params = {
          module: 'token',
          action: 'getTokenHolders',
          contractaddress: tokenAddress,
          page,
          offset: options.pageSize,
          apikey: networkConfig.BLOCKSCOUT_API_KEY,
        }

        try {
          const url = `${baseUrl}/api`
          const response = await retryRequest(async () =>
            BottleneckModule.getBlockScoutLimiter(network).schedule(async () => axios.get(url, { params })),
          )

          const data = response?.data

          if (data?.message === 'OK' && Array.isArray(data?.result) && data.result.length > 0) {
            if (callback) {
              for (const item of data.result) {
                const holder = {
                  address: item.address,
                  value: item.value,
                }

                await callback(holder)
                allHolders.push(holder)
              }
            } else {
              allHolders.push(
                ...data.result.map((item: any) => ({
                  address: item.address,
                  value: item.value,
                })),
              )
            }

            if (data.result.length < options.pageSize) {
              hasMoreData = false
            } else {
              page++
              await Utils.wait(options.delayMs)
            }
          } else {
            hasMoreData = false
          }
        } catch (error) {
          logger.error('Error fetching token holders', llo({ error, page, tokenAddress }))
          hasMoreData = false
        }
      }

      return {
        holders: allHolders,
        total: allHolders.length,
        hasMore: page > options.maxPages && hasMoreData,
      }
    } catch (error) {
      logger.error('Error getAllTokenHolders', llo({ error, tokenAddress }))
      return { holders: [], total: 0, hasMore: false }
    }
  },
}

export default BlockScoutHelper
