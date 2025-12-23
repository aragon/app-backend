import config from '@config'
import dayjs from '@helpers/dayjs'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { type IToken, ITokenType, NetworksEnum } from '@types'
import axios from 'axios'

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
      volume_usd: {
        h24: string
      }
    }
  }
}

const CoinGeckoHelper = {
  axiosInstance: axios.create({
    baseURL: config.COINGECKO.URI,
    headers: {
      'x-cg-pro-api-key': config.COINGECKO.API_KEY,
      'Content-Type': 'application/json',
    },
  }),

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

  nativeTokenIdMap: {
    [NetworksEnum.ethereumMainnet]: 'ethereum',
    [NetworksEnum.polygonMainnet]: 'polygon-ecosystem-token',
    [NetworksEnum.baseMainnet]: 'ethereum',
    [NetworksEnum.arbitrumMainnet]: 'ethereum',
    [NetworksEnum.zksyncMainnet]: 'ethereum',
    [NetworksEnum.optimismMainnet]: 'ethereum',
    [NetworksEnum.avaxMainnet]: 'avalanche-2',
    [NetworksEnum.peaqMainnet]: 'peaq-2',
    [NetworksEnum.chilizMainnet]: 'chiliz',
    [NetworksEnum.cornMainnet]: 'bitcoin',
    [NetworksEnum.katanaMainnet]: 'ethereum',
  },

  testnetNativeTokenMap: {
    [NetworksEnum.ethereumSepolia]: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    [NetworksEnum.zksyncSepolia]: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  networkToCoinGecko: (network: NetworksEnum) => {
    return CoinGeckoHelper.networksMap[network]
  },

  networkToNativeTokenId: (network: NetworksEnum) => {
    return CoinGeckoHelper.nativeTokenIdMap[network]
  },

  isTestNetwork: (network: NetworksEnum): boolean => {
    return !CoinGeckoHelper.networksMap[network]
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

  getNativeToken: async (network: NetworksEnum): Promise<IToken | false> => {
    const testnetToken = CoinGeckoHelper.testnetNativeTokenMap[network]
    if (testnetToken) {
      return {
        address: utils.zeroAddress,
        network,
        type: ITokenType.native,
        name: testnetToken.name,
        symbol: testnetToken.symbol,
        decimals: testnetToken.decimals,
        logo: '',
        priceUsd: '0',
        lastUpdatedAt: dayjs().toISOString(),
        createdAt: dayjs().toISOString(),
        totalSupply: '0',
        holders: 0,
      }
    }

    const coinId = CoinGeckoHelper.networkToNativeTokenId(network)
    if (!coinId) {
      return false
    }

    const path = `/coins/${coinId}?localization=false&tickers=false&community_data=false&market_data=true&developer_data=false`
    try {
      const response = await CoinGeckoHelper._rpCall<any>(path, network)
      return CoinGeckoHelper._parseNativeToken(response, network)
    } catch (error: any) {
      if (!error?.response?.data?.error?.includes('not found') && error?.status !== 401) {
        logger.warn('Error in CoinGecko RPC Call', llo({ path, error }))
      }
      return false
    }
  },

  getToken: async (tokenContractAddress: string, network: NetworksEnum): Promise<IToken | false> => {
    if (utils.zeroAddress === tokenContractAddress) {
      return CoinGeckoHelper.getNativeToken(network)
    }

    const networkId = CoinGeckoHelper.networkToCoinGecko(network)

    if (!networkId) {
      logger.warn('Network not supported by CoinGecko', llo({ network }))
      return false
    }

    try {
      const tokenPath = `/onchain/networks/${networkId}/tokens/${tokenContractAddress}`
      const tokenResponse = await CoinGeckoHelper._rpCall<ICoinGeckoTokenResponse>(tokenPath, network)
      return CoinGeckoHelper._parseToken(tokenResponse, network)
    } catch (error: any) {
      if (error?.response?.statusText === 'Payment Required') {
        logger.error('CoinGecko payment error', llo({ tokenContractAddress, network }))
      }
      return false
    }
  },

  _parseNativeToken: (response: any, network: NetworksEnum): IToken => {
    const decimalPlacesOfPlatforms = Object.keys(response.detail_platforms || {})
    return {
      address: utils.zeroAddress,
      network,
      type: ITokenType.native,
      name: response.name || '',
      symbol: response.symbol || '',
      decimals: response.detail_platforms?.[decimalPlacesOfPlatforms[0]]?.decimal_place || 18,
      logo: response.image?.large || '',
      priceUsd: response.market_data?.current_price?.usd?.toString() || '0',
      lastUpdatedAt: dayjs().toISOString(),
      createdAt: dayjs().toISOString(),
      totalSupply: '0',
      holders: 0,
    }
  },

  _parseToken: (response: ICoinGeckoTokenResponse, network: NetworksEnum): IToken => {
    const token = response.data.attributes

    const volume24h = parseFloat(token.volume_usd?.h24 || '0')
    const isDeadToken = volume24h < 10

    return {
      address: Web3Utils.parseAddress(token.address)!,
      network,
      type: ITokenType.ERC20,
      logo: token.image_url || '',
      name: token.name || '',
      symbol: token.symbol || '',
      decimals: token.decimals || 18,
      totalSupply: token.total_supply || '0',
      priceUsd: isDeadToken ? '0' : token.price_usd || '0',
      lastUpdatedAt: dayjs().toISOString(),
      createdAt: dayjs().toISOString(),
    }
  },
}

export default CoinGeckoHelper
