import logger from '@logger'
import { NetworksEnum, AnkrNetworksEnum, type HexAddress, type AnkrTokenHoldersResponse } from '@src/types'
import ProviderModule from '@modules/provider'
import config from '@config'
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'helpers:AnkrHelper' })

const AnkrHelper = {
  ankrNetworkMap: {
    [NetworksEnum.ethereumMainnet]: AnkrNetworksEnum.ethereumMainnet,
    [NetworksEnum.ethereumSepolia]: AnkrNetworksEnum.ethereumSepolia,
    [NetworksEnum.polygonMainnet]: AnkrNetworksEnum.polygonMainnet,
    [NetworksEnum.baseMainnet]: AnkrNetworksEnum.baseMainnet,
    [NetworksEnum.arbitrumMainnet]: AnkrNetworksEnum.arbitrumMainnet,
    [NetworksEnum.optimismMainnet]: AnkrNetworksEnum.optimismMainnet,
  },

  _constructUrl(network: NetworksEnum) {
    const ankrNetworkTagName = AnkrHelper.ankrNetworkMap[network]
    if (!ankrNetworkTagName) {
      return null
    }
    const rpcUrl = config.ANKR_CONFIG.API_URL
    return {
      blockchain: ankrNetworkTagName,
      chainId: ProviderModule.getChainId(network),
      multichainApiUrl: `${rpcUrl}/multichain/${config.ANKR_CONFIG.API_KEY}`,
      chainUrl: `${rpcUrl}/${ankrNetworkTagName}/${config.ANKR_CONFIG.API_KEY}`,
    }
  },

  async _rpcCall<T>(url: string, method: string, params: any): Promise<T | null> {
    try {
      const requestBody = {
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }

      const response = await axios.post<T>(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      return response.data
    } catch (error) {
      logger.error('Error making RPC call', llo({ method, params, error }))
      return null
    }
  },

  async getTokenHoldersCount(
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ holders: number; transfers: number } | null> {
    try {
      const ankrParams = AnkrHelper._constructUrl(network)
      if (!ankrParams) {
        logger.warn('No Ankr network mapping found', llo({ network }))
        return null
      }

      const params = {
        blockchain: ankrParams.blockchain,
        contractAddress: tokenAddress,
        pageSize: 1,
      }

      const response = await AnkrHelper._rpcCall<AnkrTokenHoldersResponse>(
        ankrParams.multichainApiUrl,
        'ankr_getTokenHoldersCount',
        params,
      )

      if (response?.result?.holderCountHistory?.length! > 0) {
        const latestData = response?.result.holderCountHistory[0]
        return {
          holders: latestData!.holderCount || 0,
          transfers: 0,
        }
      }

      logger.warn('Invalid response from Ankr API', llo({ tokenAddress, network, response }))
      return null
    } catch (error) {
      logger.error('Error getting token holders count', llo({ tokenAddress, network, error }))
      return null
    }
  },
}

export default AnkrHelper
