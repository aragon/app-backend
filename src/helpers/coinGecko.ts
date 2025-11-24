import { type IToken, ITokenType, NetworksEnum } from '@types'
import config from '@config'
import dayjs from '@helpers/dayjs'
import axios from 'axios'
import logger from '@logger'
import Web3Utils from '@helpers/web3Utils'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

const llo = logger.logMeta.bind(null, { service: 'coinGecko' })

interface ICoinGeckoTokenResponse {
  data: {
    id: string
    type: string
    attributes: {
      address: string
      name: string
      symbol: string
      image_url: string
      decimals: number
      total_supply: string
      price_usd: string
      fdv_usd: string
      total_reserve_in_usd: string
      volume_usd: {
        h24: string
      }
      market_cap_usd: string | null
    }
  }
}

const CoinGeckoHelper = {
  axiosInstance: axios.create({
    baseURL: config.COINGECKO.URI,
    headers: {
      'x-cg-demo-api-key': config.COINGECKO.API_KEY,
      'Content-Type': 'application/json',
    },
  }),

  // https://api.coingecko.com/api/v3/onchain/networks
  networksMap: {
    [NetworksEnum.ethereumMainnet]: 'eth',
    [NetworksEnum.polygonMainnet]: 'polygon_pos',
    [NetworksEnum.baseMainnet]: 'base',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum',
    [NetworksEnum.zksyncMainnet]: 'zksync',
    [NetworksEnum.optimismMainnet]: 'optimism',
    [NetworksEnum.avaxMainnet]: 'avax',
    [NetworksEnum.peaqMainnet]: 'peaq',
    [NetworksEnum.chilizMainnet]: 'chiliz-chain',
    [NetworksEnum.cornMainnet]: 'corn',
    [NetworksEnum.katanaMainnet]: 'katana',
  },

  networkToCoinGecko: (network: NetworksEnum) => {
    return CoinGeckoHelper.networksMap[network]
  },

  _rpCall: async <T>(path: string, network: NetworksEnum): Promise<T> => {
    try {
      const response: any = await retryRequest(async () =>
        BottleneckModule.getCoinGeckoLimiter(network).schedule(async () =>
          CoinGeckoHelper.axiosInstance.get(`${config.COINGECKO.URI}${path}`),
        ),
      )
      return response.data
    } catch (error: any) {
      if (!error?.response?.data?.error?.includes('not found') && error?.status !== 401) {
        logger.warn('Error in CoinGecko RPC Call', llo({ path, error }))
      }
      throw error
    }
  },

  getToken: async (tokenContractAddress: string, network: NetworksEnum): Promise<Partial<IToken> | false> => {
    const networkId = CoinGeckoHelper.networkToCoinGecko(network)

    if (!networkId) {
      logger.warn('Network not supported by CoinGecko', llo({ network }))
      return false
    }

    const path = `/onchain/networks/${networkId}/tokens/${tokenContractAddress}/info`

    try {
      const response = await CoinGeckoHelper._rpCall<ICoinGeckoTokenResponse>(path, network)
      return CoinGeckoHelper._parseToken(response, network)
    } catch (error: any) {
      if (error?.response?.statusText === 'Payment Required') {
        logger.error('CoinGecko payment error', llo({ tokenContractAddress, network }))
      }
      return false
    }
  },

  _parseToken: (response: ICoinGeckoTokenResponse, network: NetworksEnum): Partial<IToken> => {
    const token = response.data.attributes

    return {
      address: Web3Utils.parseAddress(token.address)!,
      network,
      type: ITokenType.ERC20,
      logo: token.image_url,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals || 18,
      priceUsd: token.price_usd || '0',
      lastUpdatedAt: dayjs().toISOString(),
    }
  },
}

export default CoinGeckoHelper
