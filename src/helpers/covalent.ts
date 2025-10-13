import {
  type HexAddress,
  type IToken,
  type ITokenBalanceResponse,
  type ITokenCovalentResponse,
  type ITokenHoldersResponse,
  type ITokenMetrics,
  ITokenType,
  NetworksEnum,
  type TokensBalancesType,
} from '@types'
import config from '@config'
import dayjs from '@helpers/dayjs'
import axios from 'axios'
import logger from '@logger'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import { assert } from '@errors'
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

  // https://goldrush.dev/docs/networks/
  networksMap: {
    [NetworksEnum.polygonMainnet]: 'matic-mainnet',
    [NetworksEnum.ethereumMainnet]: 'eth-mainnet',
    [NetworksEnum.baseMainnet]: 'base-mainnet',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum-mainnet',
    [NetworksEnum.optimismMainnet]: 'optimism-mainnet',
    [NetworksEnum.ethereumSepolia]: 'eth-sepolia',
    [NetworksEnum.zksyncSepolia]: 'zksync-sepolia-testnet',
    [NetworksEnum.zksyncMainnet]: 'zksync-mainnet',
    [NetworksEnum.avaxMainnet]: 'avalanche-mainnet',
  },

  skipTestNetworks: [NetworksEnum.zksyncSepolia, NetworksEnum.ethereumSepolia],

  nativeTokens: {
    [NetworksEnum.ethereumMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.ethereumSepolia]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.polygonMainnet]: '0x0000000000000000000000000000000000001010',
    [NetworksEnum.arbitrumMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.baseMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.zksyncMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.zksyncSepolia]: '0x000000000000000000000000000000000000800a',
    [NetworksEnum.optimismMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.avaxMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  },

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
        BottleneckModule.getCovalentLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          CovalentHelper.axiosInstance.get(`${config.COVALENT.URI}${path}`),
        ),
      )
      return response.data.data
    } catch (error: any) {
      if (!error?.response?.data?.error_message?.includes('not found') && error?.status !== 401) {
        logger.warn('Error in Covalent RPC Call', llo({ path, error }))
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

  getToken: async (
    tokenContractAddress: string,
    network: NetworksEnum,
    pastDays: number = 1,
  ): Promise<Partial<IToken> | false> => {
    let isNativeToken = false

    if (tokenContractAddress === utils.zeroAddress) {
      tokenContractAddress = CovalentHelper.nativeTokens[network]
      isNativeToken = true
    }

    const networkId = CovalentHelper.networkToCovalent(network)
    const back2Days = dayjs().subtract(Math.round(pastDays), 'days').format('YYYY-MM-DD')
    const path = `/pricing/historical_by_addresses_v2/${networkId}/${config.DEFAULT_CURRENCY}/${tokenContractAddress}/?from=${back2Days}`

    try {
      const response = await CovalentHelper._rpCall<ITokenCovalentResponse[]>(path)
      assert(response.length > 0, 'Price data not complete')

      return CovalentHelper._parseToken(response[0], network, isNativeToken)
    } catch (error: any) {
      if (error?.response?.statusText === 'Payment Required') {
        logger.error('Covalent payment error', llo({ tokenContractAddress, network, pastDays }))
      }
      return false
    }
  },

  _parseToken: (token: ITokenCovalentResponse, network: NetworksEnum, isNativeToken: boolean): Partial<any> => {
    const validPrices = token.prices?.filter(price => price.price !== null)

    const mostRecentPrice = validPrices?.[0]?.price ?? 0
    const type = CovalentHelper.getTokenType(token)

    return {
      address: isNativeToken ? utils.zeroAddress : Web3Utils.parseAddress(token.contract_address)!,
      network,
      type,
      logo: token.logo_url,
      name: token.contract_name,
      symbol: token.contract_ticker_symbol,
      decimals: token.contract_decimals || (type === ITokenType.ERC20 ? 18 : 0),
      priceUsd: mostRecentPrice.toString(),
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

  async getTokenTotalSupply(
    address: HexAddress,
    network: NetworksEnum,
    blockHeight: number,
  ): Promise<number | string | null> {
    const networkId = CovalentHelper.networkToCovalent(network)
    const path = `/${networkId}/tokens/${address}/token_holders_v2/?block-height=${blockHeight}`
    try {
      const response = await CovalentHelper._rpCall<ITokenHoldersResponse>(path)
      assert(response.items && response.items.length > 0, 'Token supply data not complete')

      return response.items[0].total_supply
    } catch (error) {
      return null
    }
  },

  async getTokenSupplyAndHolders(
    address: HexAddress,
    network: NetworksEnum,
    blockHeight: number | undefined = undefined,
  ): Promise<ITokenMetrics | { totalHolders: number; totalSupply: string }> {
    const networkId = CovalentHelper.networkToCovalent(network)
    const path = `/${networkId}/tokens/${address}/token_holders_v2/?${blockHeight ? `block-height=${blockHeight}` : ''}`
    try {
      const response = await CovalentHelper._rpCall<ITokenHoldersResponse>(path)
      assert(response.items && response.items.length > 0, 'Token holders data not complete')

      const totalHolders = response.pagination.total_count
      const totalSupply = response.items[0].total_supply as string

      return {
        totalSupply,
        totalHolders,
      }
    } catch (error) {
      logger.warn('Covalent fails getTokenSupplyAndHolders', llo({ address, network, blockHeight, error }))
      return { totalHolders: 0, totalSupply: '0' }
    }
  },
}

export default CovalentHelper
