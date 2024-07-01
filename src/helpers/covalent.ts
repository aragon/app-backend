import {
  type HexAddress,
  type IToken,
  type ITokenCovalentResponse,
  NetworksEnum,
  type ITokenBalanceResponse,
  type TokensBalancesType,
  ITokenType,
} from '@types'
import config from '@config'
import dayjs from '@helpers/dayjs'
import axios from 'axios'
import logger from '@logger'
import utils from '@helpers/utils'
import { assert } from '@errors'
import Web3Helper from '@helpers/web3'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

const llo = logger.logMeta.bind(null, { service: 'covalent' })

const CovalentHelper = {
  axiosInstance: axios.create({
    baseURL: config.COVALENT.URI,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.COVALENT.API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  }),

  networksMap: {
    [NetworksEnum.polygonMainnet]: 'matic-mainnet',
    [NetworksEnum.ethereumMainnet]: 'eth-mainnet',
    [NetworksEnum.baseMainnet]: 'base-mainnet',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum-mainnet',
    [NetworksEnum.ethereumSepolia]: 'eth-sepolia',
    [NetworksEnum.zksyncSepolia]: 'zksync-sepolia-testnet',
    [NetworksEnum.zksyncMainnet]: 'zksync-mainnet',
  },

  skipTestNetworks: [NetworksEnum.zksyncSepolia, NetworksEnum.ethereumSepolia],

  nativeTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as HexAddress,

  networkToCovalent: (network: NetworksEnum) => {
    return CovalentHelper.networksMap[network]
  },

  networkFromCovalent: (covalentNetwork: string) => {
    return Object.entries(CovalentHelper.networksMap).find(([, cov]) => cov === covalentNetwork)?.[0] as
      | NetworksEnum
      | undefined
  },

  _rpCall: async <T>(path: string): Promise<T> => {
    try {
      const response: any = await retryRequest(async () =>
        BottleneckModule.getCovalentLimiter(NetworksEnum.ethereumMainnet)!.schedule(async () =>
          CovalentHelper.axiosInstance.get(`${config.COVALENT.URI}${path}`),
        ),
      )
      return response.data.data
    } catch (error: any) {
      if (!error?.response?.data?.error_message?.includes('not found')) {
        logger.error('Error in Covalent RPC Call', llo({ path, error }))
      }
      throw error
    }
  },

  getTokenType: (token: ITokenCovalentResponse): ITokenType => {
    let type = ITokenType.native

    if (token.supports_erc[0] === 'erc20') {
      type = ITokenType.ERC20
    } else if (token.supports_erc[0] === 'erc721') {
      type = ITokenType.ERC721
    }

    return type
  },

  getToken: async (tokenContractAddress: string, network: NetworksEnum): Promise<Partial<IToken> | false> => {
    if (CovalentHelper.skipTestNetworks.includes(network)) {
      return false
    }

    if (tokenContractAddress === utils.zeroAddress) {
      tokenContractAddress = CovalentHelper.nativeTokenAddress
    }

    const networkId = CovalentHelper.networkToCovalent(network)
    const back2Days = dayjs().subtract(2, 'day').format('YYYY-MM-DD')
    const path = `/pricing/historical_by_addresses_v2/${networkId}/${config.DEFAULT_CURRENCY}/${tokenContractAddress}/?from=${back2Days}`

    try {
      const response = await CovalentHelper._rpCall<ITokenCovalentResponse[]>(path)
      assert(response.length > 0, 'Price data not complete')

      return CovalentHelper._parseToken(response[0], network)
    } catch (_) {
      return false
    }
  },

  _parseToken: (token: ITokenCovalentResponse, network: NetworksEnum): Partial<any> => {
    const validPrices = token.prices?.filter(price => price.price !== null)

    const mostRecentPrice = validPrices?.[0]?.price ?? 0
    const dayBeforePrice = validPrices?.[1]?.price ?? mostRecentPrice
    const priceChangeOnDayUsd = mostRecentPrice - dayBeforePrice
    const type = CovalentHelper.getTokenType(token)

    return {
      address: Web3Helper.parseAddress(token.contract_address)!,
      network,
      type,
      logo: token.logo_url,
      name: token.contract_name,
      symbol: token.contract_ticker_symbol,
      decimals: token.contract_decimals,
      priceUsd: mostRecentPrice.toString(),
      priceChangeOnDayUsd,
      lastUpdatedAt: dayjs().utc().toDate(),
    }
  },

  getTokenBalance: async (
    address: HexAddress,
    network: NetworksEnum,
    currency: string,
  ): Promise<TokensBalancesType | false> => {
    const networkId = CovalentHelper.networkToCovalent(network)
    const path = `/${networkId}/address/${address}/balances_v2/?quote-currency=${currency}`

    try {
      const response = await CovalentHelper._rpCall<ITokenBalanceResponse>(path)
      return {
        updatedAt: response.updated_at,
        items: response.items.map(w => ({
          contractAddress: w.contract_address,
          contractName: w.contract_name,
          contractTickerSymbol: w.contract_ticker_symbol,
          contractDecimals: w.contract_decimals,
          nativeToken: w.native_token || false,
          balance: w.balance,
          logoUrl: w.logo_url,
        })),
      }
    } catch (_) {
      return false
    }
  },
}

export default CovalentHelper
