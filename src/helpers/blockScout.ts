import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { type HexAddress, type NetworksEnum } from '@types'
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
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network)!.schedule(async () =>
          BlockScoutHelper.axiosInstance(network).get(`v2/${path}`, { params }),
        ),
      )
      return response?.data
    } catch (error) {
      logger.error('Error in BLockScoutApi API call', llo({ error, path, params }))
      throw error
    }
  },

  getTokenFullDetails: async (address: HexAddress, network: NetworksEnum): Promise<ITokenFullDetails | boolean> => {
    const params = {
      apikey: BlockScoutHelper._parseNetworkToConfig(network).BLOCKSCOUT_API_KEY,
    }
    const path = `tokens/${address}`

    try {
      const tokenDetails: any = {}
      const response = await BlockScoutHelper._rpCall(path, params, network)
      if (response?.address) {
        tokenDetails.address = response.address
        tokenDetails.name = response.name
        tokenDetails.symbol = response.symbol
        tokenDetails.decimals = response.decimals
        tokenDetails.totalSupply = response.total_supply
        tokenDetails.holders = response.holders
        tokenDetails.logo = response.icon_url
        tokenDetails.type = response.type

        return tokenDetails
      }
    } catch (error) {
      logger.warn('Error getTokenDetails', llo({ error }))
    }

    return false
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

  /**
   * Given a query, it will return the details of the address/symbol/token
   * @param query
   * @param network
   */
  searchDetails: async (query: string, network: NetworksEnum) => {
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
      const response = await BlockScoutHelper._rpCall(path, params, network)
      if (response) {
        return response
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
      logger.error('Error getContractProxy', llo({ error }))
    }

    return toReturn
  },
}

export default BlockScoutHelper
