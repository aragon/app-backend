import logger from '@logger'
import { type ISubScanTokenInfo, type ITokenMetrics, ITokenType, type IWeb3Provider, type NetworksEnum } from '@types'
import utils from '@helpers/utils'
import axios from 'axios'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { ethers } from 'ethers'
import { IBlockScoutAddressType } from '@src/types/blockScout'
import RouteScanHelper from '@helpers/routeScanHelper'
import config from '@config'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

const llo = logger.logMeta.bind(null, { service: 'provider:ChilizProvider' })

const ChilizProvider: Omit<IWeb3Provider, 'getNativeBalance'> & {
  _rpcCall: any
} = {
  getTokenBalances: async ({ address, network }) => {
    const path = 'api'
    const params = {
      module: 'account',
      action: 'tokenlist',
      address,
    }

    try {
      const response = await ChilizProvider._rpcCall(path, params, network)
      if (response?.message === 'OK' && response?.result) {
        return response.result.map((token: any) => ({
          contractAddress: ethers.getAddress(token.contractAddress) || token.contractAddress,
          tokenBalance: ethers.formatUnits(token.balance, parseInt(token.decimals)),
        }))
      }
      return []
    } catch (error: any) {
      logger.warn('Chiliz Provider token balance api failed', llo({ error, path, params }))
      return []
    }
  },

  fetchContractCreation: async ({ address, network }) => {
    const explorers = [EvmExplorerEnum.CHILIZ, EvmExplorerEnum.ROUTESCAN]

    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractCreation(explorerType, address, network)
      },
      {
        validate: result => !!result?.transactionHash,
        onError: (error, explorerType, index) => {
          logger.warn(
            `Failed to fetch contract creation from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result || { blockNumber: 0, transactionHash: null, address }
  },

  fetchContractSourceCode: async ({ address, network }) => {
    const explorers = [EvmExplorerEnum.CHILIZ, EvmExplorerEnum.ROUTESCAN]

    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractSourceCode(explorerType, address, network)
      },
      {
        validate: result => !!result && result.length > 0 && !!result[0]?.SourceCode,
        onError: (error, explorerType, index) => {
          logger.warn(
            `Failed to fetch contract source code from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result
  },

  fetchBasicTokenInfo: async ({ address, network }) => {
    const tokenInfo = {
      address,
      name: null,
      symbol: null,
      decimals: 0,
      type: ITokenType.unknown,
      logo: null,
      priceUsd: '0',
      totalSupply: '0',
      totalHolders: '0',
    } as any

    if (address === utils.zeroAddress) {
      tokenInfo.name = 'Chiliz'
      tokenInfo.symbol = 'CHZ'
      tokenInfo.decimals = 18
      tokenInfo.type = ITokenType.native

      try {
        const response = await ChilizProvider._rpcCall(
          'api',
          {
            module: 'stats',
            action: 'coinprice',
          },
          network,
        )

        if (response.message === 'OK' && response.result?.coin_usd) {
          tokenInfo.priceUsd = response.result.coin_usd
        }
      } catch (e) {
        logger.warn('Failed to fetch CHZ price', { error: e })
      }

      return tokenInfo
    }

    try {
      const tokenResponse = await ChilizProvider._rpcCall(
        'api',
        {
          module: 'token',
          action: 'getToken',
          contractaddress: address,
        },
        network,
      )

      if (tokenResponse?.message === 'OK' && tokenResponse?.result) {
        tokenInfo.name = tokenResponse.result.name || null
        tokenInfo.symbol = tokenResponse.result.symbol || null
        tokenInfo.decimals = tokenResponse.result.decimals || 0
        tokenInfo.type =
          tokenResponse.result.type === 'ERC-20'
            ? ITokenType.ERC20
            : tokenResponse.result.type === 'ERC-721'
              ? ITokenType.ERC721
              : ITokenType.unknown
        tokenInfo.totalSupply = tokenResponse.result.totalSupply || '0'
        tokenInfo.totalHolders = '0'
      }
    } catch (error) {
      logger.warn('Chiliz Provider basic token info failed', { error, address, network })
    }

    return tokenInfo as ISubScanTokenInfo
  },

  fetchTokenHolderAndSupply: async ({ address, network }): Promise<ITokenMetrics> => {
    const tokenInfo = await ChilizProvider.fetchBasicTokenInfo({ address, network })
    return {
      totalHolders: tokenInfo.totalHolders || '0',
      totalSupply: tokenInfo.totalSupply || '0',
    }
  },

  fetchTokenPrice: async ({ address, network }) => {
    if (address === utils.zeroAddress) {
      try {
        const response = await ChilizProvider._rpcCall(
          'api',
          {
            module: 'stats',
            action: 'coinprice',
          },
          network,
        )
        if (response.message === 'OK' && response.result?.coin_usd) {
          return {
            priceUsd: response.result.coin_usd,
          }
        }
      } catch (e) {
        logger.warn('Failed to fetch CHZ price', { error: e })
      }
    }
    return {
      priceUsd: '0',
    }
  },

  searchDetailsOfContract: async ({ address, network }) => {
    const token = await ChilizProvider.fetchBasicTokenInfo({ address, network })

    if (token.type === ITokenType.unknown) {
      const contractInfo = await ChilizProvider.fetchContractSourceCode({ address, network })

      if (!contractInfo) {
        return {
          type: IBlockScoutAddressType.ADDRESS,
          name: null,
        }
      }

      return {
        type: IBlockScoutAddressType.ADDRESS,
        name: contractInfo[0].ContractName,
      }
    }

    return {
      type: IBlockScoutAddressType.TOKEN,
      name: token.name,
    }
  },

  _rpcCall: async (path: string, params: any, network: NetworksEnum) => {
    const baseUrl = config.CHILIZ_API_URL

    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getChilizLimiter(network).schedule(async () =>
          axios.get(`${baseUrl}/${path}`, {
            params,
          }),
        ),
      )
      return response?.data
    } catch (error) {
      logger.warn('Chiliz Provider API call Failed', llo({ error, path, params }))
      throw error
    }
  },

  getTokenCounters: async ({ address, network }) => {
    return {
      holders: await RouteScanHelper.fetchTokenHoldersCount({
        network,
        address,
      }),
      transfers: 0,
    }
  },

  fetchHistoricalTokenPrice: async () => {
    return '0'
  },
}

export default ChilizProvider
