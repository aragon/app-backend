import logger from '@logger'
import { type IWeb3Provider, type NetworksEnum } from '@types'
import utils from '@helpers/utils'
import axios from 'axios'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { ethers } from 'ethers'
import { IBlockScoutAddressType } from '@src/types/blockScout'
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

  searchDetailsOfContract: async ({ address, network }) => {
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

  fetchHistoricalTokenPrice: async () => {
    return '0'
  },
}

export default ChilizProvider
