import { type HexAddress, type ITokenCoinGeckoResponse, type ITokenPriceCoinGecko, NetworksEnum } from '@types'
import config from '@config'
import axios from 'axios'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'CoinGecko' })

const CoinGeckoHelper = {
  axiosInstance: axios.create({
    baseURL: config.COINGECKO.URI,
    headers: {
      Authorization: `Basic ${config.COINGECKO.API_KEY}`,
      'Content-Type': 'application/json',
    },
  }),

  unsupportedNetworks: [NetworksEnum.ethereumSepolia],

  networksMap: {
    [NetworksEnum.ethereumMainnet]: 'ethereum',
    [NetworksEnum.polygonMainnet]: 'polygon-pos',
    [NetworksEnum.baseMainnet]: 'base',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum-nova',
  },

  coinsMap: {
    [NetworksEnum.polygonMainnet]: 'polygon-ecosystem-token',
    [NetworksEnum.ethereumMainnet]: 'ethereum',
    [NetworksEnum.baseMainnet]: 'base',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum',
    [NetworksEnum.ethereumSepolia]: 'ethereum',
  },

  networkToCoinGecko: (network: NetworksEnum) => {
    return CoinGeckoHelper.networksMap[network]
  },

  coinToCoinGecko: (network: NetworksEnum) => {
    return CoinGeckoHelper.coinsMap[network]
  },

  _rpCall: async <T>(path: string): Promise<T> => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getCoinGeckoLimiter(NetworksEnum.ethereumMainnet)!.schedule(async () =>
          CoinGeckoHelper.axiosInstance.get(`${config.COINGECKO.URI}${path}`),
        ),
      )

      return response.data
    } catch (error: any) {
      logger.error('Error in CoinGecko RPC Call', llo({ path, error }))
      throw error
    }
  },

  getCoinTokenPrice: async (address: HexAddress, network: NetworksEnum): Promise<ITokenPriceCoinGecko | undefined> => {
    if (CoinGeckoHelper.unsupportedNetworks.includes(network)) {
      return
    }

    const networkId = CoinGeckoHelper.networkToCoinGecko(network)
    const isNative = address === utils.zeroAddress

    const path = isNative ? `/coins/${address}` : `/coins/${networkId}/contract/${address}`

    try {
      const response = await CoinGeckoHelper._rpCall<ITokenCoinGeckoResponse[]>(path)

      // TODO: check the response retrive token info
      if (response?.[address]) {
        return {
          usd: response?.[address].usd,
          usd24hChange: response?.[address].usd_24h_change,
        }
      }
    } catch (error) {
      logger.error('Error coin token price', llo({ error, network, address }))
    }
  },

  getTokenPrice: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<ITokenPriceCoinGecko | undefined> => {
    if (CoinGeckoHelper.unsupportedNetworks.includes(network)) {
      return
    }

    const networkId = CoinGeckoHelper.networkToCoinGecko(network)
    const path = `/simple/token_price/${networkId}?contract_addresses=${tokenAddress}&vs_currencies=${config.DEFAULT_CURRENCY}&include_24hr_change=true&precision=2`

    try {
      const response = await CoinGeckoHelper._rpCall<ITokenCoinGeckoResponse[]>(path)

      if (response?.[tokenAddress]) {
        return {
          usd: response?.[tokenAddress].usd,
          usd24hChange: response?.[tokenAddress].usd_24h_change,
        }
      }
    } catch (error) {
      logger.error('Error token price', llo({ error, network, tokenAddress }))
    }
  },

  getCoinPrice: async (network: NetworksEnum): Promise<ITokenPriceCoinGecko | undefined> => {
    if (CoinGeckoHelper.unsupportedNetworks.includes(network)) {
      return
    }

    const coinId = CoinGeckoHelper.coinToCoinGecko(network)
    const path = `/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&precision=2`

    try {
      const response = await CoinGeckoHelper._rpCall<ITokenCoinGeckoResponse[]>(path)

      if (response?.[coinId]) {
        return {
          usd: response && (response[coinId].usd as any),
          usd24hChange: response && (response[coinId].usd_24h_change as any),
        }
      }
    } catch (error) {
      logger.error('Error coin price', llo({ error, network, coinId }))
    }
  },
}

export default CoinGeckoHelper
