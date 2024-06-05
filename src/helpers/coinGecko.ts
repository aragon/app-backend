import {
  type HexAddress,
  type INetworks,
  type ITokenCoinGeckoResponse,
  type ITokenPriceCoinGecko,
  NetworksEnum,
} from '@types'
import config from '@config'
import axios from 'axios'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'CoinGecko' })

const CoinGeckoHelper = {
  axiosInstance: axios.create({
    baseURL: config.COINGECKO.URI,
    headers: {
      Authorization: `Basic ${config.COINGECKO.API_KEY}`,
      'Content-Type': 'application/json',
    },
  }),

  unsupportedNetworks: [NetworksEnum.sepolia],

  networksMap: {
    mainnet: 'ethereum',
    polygon: 'polygon-pos',
    base: 'base',
    arbitrum: 'arbitrum-nova',
  },

  coinsMap: {
    polygon: 'polygon-ecosystem-token',
    mainnet: 'ethereum',
    base: 'base',
    arbitrum: 'arbitrum',
  },

  networkToCoinGecko: (network: INetworks) => {
    return CoinGeckoHelper.networksMap[network]
  },

  coinToCoinGecko: (network: INetworks) => {
    return CoinGeckoHelper.coinsMap[network]
  },

  _rpCall: async <T>(path: string): Promise<T> => {
    try {
      const response = await CoinGeckoHelper.axiosInstance.get(`${config.COINGECKO.URI}${path}`)
      return response.data
    } catch (error) {
      logger.error('Error in CoinGecko RPC Call', llo({ path, error }))
      throw error
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
