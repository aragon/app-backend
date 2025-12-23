import config from '@config'
import dayjs from '@helpers/dayjs'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import {
  type HexAddress,
  type ISubScanContractCreation,
  type ISubScanNativeTokenInfo,
  type ISubScanTokenBalance,
  type ISubScanTokenInfo,
  ITokenType,
  type NetworksEnum,
} from '@types'
import axios from 'axios'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:SubscanApiHelper' })

const SubscanApiHelper = {
  axiosInstance: (network: NetworksEnum) =>
    axios.create({
      baseURL: SubscanApiHelper._parseNetworkToConfig(network).SUBSCAN_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': SubscanApiHelper._parseNetworkToConfig(network).SUBSCAN_API_KEY || undefined,
      },
    }),

  _parseNetworkToConfig: (network: NetworksEnum) => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    return config.NODES[networkConfigKey]
  },

  _rpCall: async (path: string, params: object, network: NetworksEnum, replacedPath?: any) => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          SubscanApiHelper.axiosInstance(network).post(replacedPath || `api/scan/${path}`, params),
        ),
      )
      return response?.data
    } catch (error) {
      logger.warn('SubscanApi API call', llo({ error, path, params }))
      throw error
    }
  },

  getAccountInfoByKey: async (address: HexAddress, network: NetworksEnum): Promise<string | undefined> => {
    const path = 'search'
    const params = {
      key: address,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data?.account.substrate_account?.address) {
        return response.data.account.substrate_account.address
      }
    } catch (error) {
      logger.warn('SubscanApi getAccountInfoByKey', llo({ error, address }))
    }
  },

  getContractSourceCode: async (address: string, network: NetworksEnum) => {
    const path = 'evm/contract'
    const params = {
      address,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        const toReturn = {
          SourceCode: response.data.source_code,
          ABI: JSON.stringify(response.data.abi),
          ContractName: response.data.contract_name,
        }
        return [toReturn]
      }
    } catch (error) {
      logger.warn('SubscanApi getContractSourceCode', llo({ error, address }))
    }
  },

  async fetchContractCreation(
    contractAddress: string,
    network: NetworksEnum,
  ): Promise<ISubScanContractCreation | null> {
    const path = 'evm/contract'
    const params = {
      address: contractAddress,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        return {
          address: contractAddress,
          transactionHash: response.data.transaction_hash,
          blockNumber: response.data.block_num,
        }
      }
    } catch (error) {
      logger.warn('SubscanApi getContractSourceCode', llo({ error, address: contractAddress }))
    }

    return null
  },

  async getTokenFullDetails(address: HexAddress, network: NetworksEnum): Promise<ISubScanTokenInfo> {
    const tokenDetails: ISubScanTokenInfo = {
      address,
      decimals: null,
      name: null,
      symbol: null,
      priceUsd: '0',
      type: ITokenType.unknown,
      logo: null,
      lastUpdatedAt: null,
      totalSupply: '0',
      holders: 0,
    }
    try {
      const path = 'evm/tokens'
      const params = {
        contracts: [address],
      }
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data && response.data.list?.length > 0) {
        const tokenInfo = response.data.list[0]

        tokenDetails.totalSupply = tokenInfo.totalSupply
        tokenDetails.holders = tokenInfo.holders
        tokenDetails.name = tokenInfo.name
        tokenDetails.symbol = tokenInfo.symbol
        tokenDetails.decimals = tokenInfo.decimals
        tokenDetails.priceUsd = tokenInfo.price
        tokenDetails.lastUpdatedAt = dayjs.utc().toDate()

        switch (tokenInfo.category) {
          case 'erc20':
            tokenDetails.type = ITokenType.ERC20
            break
          case 'erc721':
            tokenDetails.type = ITokenType.ERC721
            break
          case 'erc1155':
            tokenDetails.type = ITokenType.ERC1155
            break
          default:
            tokenDetails.type = ITokenType.unknown
        }
      }
    } catch (error) {
      logger.warn('SubscanApi getTokenSupplyAndHolders', llo({ error, address }))
    }

    return tokenDetails
  },

  getAccountBalance: async (address: HexAddress, network: NetworksEnum): Promise<ISubScanTokenBalance[]> => {
    const apiEndpoint = 'account/tokens'
    const queryParams = {
      address,
      row: 100,
    }

    try {
      const response = await SubscanApiHelper._rpCall(apiEndpoint, queryParams, network)
      if (response?.data?.native && response.data.ERC20) {
        return response.data.ERC20.map((token: any) => ({
          contractAddress: ethers.getAddress(token.contract),
          tokenBalance: token.balance,
          decimals: token.decimals,
          name: token.name,
          symbol: token.symbol,
        }))
      }
    } catch (error) {
      logger.warn('SubscanApi fetchTokenBalances', { error, address })
    }

    return []
  },

  getAccountBalances: async (address: HexAddress, network: NetworksEnum) => {
    const tokens = await SubscanApiHelper.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },

  getTransactionInfoByHash: async (txHash: string, network: NetworksEnum) => {
    const path = 'evm/transaction'
    const params = {
      hash: txHash,
    }
    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        return response.data
      }
    } catch (error) {
      logger.warn('SubscanApi getTransactionInfoByHash', llo({ error, txHash }))
    }
  },

  getNativeTokenInfo: async (network: NetworksEnum): Promise<ISubScanNativeTokenInfo> => {
    const params = {
      include_extends: true,
    }

    const tokenResponse: ISubScanNativeTokenInfo = {
      address: utils.zeroAddress,
      name: 'PEAQ',
      symbol: 'PEAQ',
      decimals: 18,
      logo: null,
      priceUsd: '0',
      type: ITokenType.native,
      totalSupply: '0',
      holders: 0,
    }

    try {
      const response = await SubscanApiHelper._rpCall('', params, network, 'api/v2/scan/token/native')
      if (response?.data?.token) {
        const price = await SubscanApiHelper.getCurrentPrice(network)

        tokenResponse.name = response.data.token.name
        tokenResponse.symbol = response.data.token.symbol
        tokenResponse.decimals = response.data.token.decimals
        tokenResponse.logo = null
        tokenResponse.priceUsd = price
        tokenResponse.totalSupply = response.data.token.total_supply
        tokenResponse.holders = response.data.token.holders
      }
    } catch (error) {
      logger.warn('Error getNativeTokenInfo', llo({ error }))
    }
    return tokenResponse
  },

  getCurrentPrice: async (network: NetworksEnum, pastDays = 1): Promise<string> => {
    const path = 'price/history'
    const backDate = dayjs().subtract(Math.round(pastDays), 'days').format('YYYY-MM-DD')
    const params = {
      start: backDate,
      end: dayjs().format('YYYY-MM-DD'),
      format: 'day',
      row: 1,
    }
    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data?.list) {
        return response.data.list[response.data.list.length - 1].price
      }
    } catch (error) {
      logger.warn('Error getCurrentPrice', llo({ error }))
    }
    return '0'
  },

  getTokenCounters: async (
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{ transfers: number; holders: number }> => {
    const tokenCounter = {
      transfers: 0,
      holders: 0,
    }

    try {
      const tokenFullInfo = await SubscanApiHelper.getTokenFullDetails(address, network)
      const params = {
        page: 0,
        row: 10,
        contract: address,
      }

      const response = await SubscanApiHelper._rpCall('evm/token/transfer', params, network)
      if (response?.code === 0 && response?.data?.list?.length > 0) {
        tokenCounter.transfers = response?.data?.count
        tokenCounter.holders = tokenFullInfo.holders
        return tokenCounter
      }
    } catch (error) {
      logger.warn('SubscanApi getTokenCounters', llo({ error, address }))
    }
    return tokenCounter
  },
}

export default SubscanApiHelper
