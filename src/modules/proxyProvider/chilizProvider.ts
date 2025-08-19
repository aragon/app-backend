import logger from '@logger'
import {
  type ISubScanTokenInfo,
  type ITokenMetrics,
  ITokenType,
  type ITxFilterBlockArgs,
  type IWeb3Provider,
  type NetworksEnum,
  type ITransactionFetchFunction,
} from '@types'
import utils from '@helpers/utils'
import axios from 'axios'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { ethers } from 'ethers'
import { IBlockScoutAddressType } from '@src/types/blockScout'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import { ITransactionCategory, ITransactionType } from '@types'
import ProxyUtils from '@modules/proxyProvider/utils'
import Web3Helper from '@helpers/web3'
import RouteScanHelper from '@helpers/routeScanHelper'
import config from '@config'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'provider:ChilizProvider' })

const ChilizProvider: Omit<IWeb3Provider, 'getNativeBalance'> & {
  _rpcCall: any
  _fetchTxList: ITransactionFetchFunction
  _fetchERC20Transfers: ITransactionFetchFunction
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

  fetchAddressTxns: async ({ address, network }) => {
    try {
      const service = ConfigIndexerHelper.builders.transferList(network, address)
      const lastSyncStat = await ProxyUtils.getProgressFromConfigIndexer(network, service)
      const latestBlock = await Web3Helper.getBlockNumber(undefined, network)
      const blockFilter: ITxFilterBlockArgs = {
        startBlock: lastSyncStat?.lastSync ? lastSyncStat.lastSync + 1 : 0,
        endBlock: latestBlock,
      }

      const [erc20Transfers, externalTransfers] = await Promise.all([
        ChilizProvider._fetchERC20Transfers(address, network, blockFilter),
        ChilizProvider._fetchTxList(address, network, blockFilter),
      ])

      const allTransactions = [...erc20Transfers, ...externalTransfers]

      const parsedTransfers = await Promise.all(
        allTransactions.map(async tx => {
          const contractAddress = tx.contractAddress || utils.zeroAddress
          const tokenInfo = await ProxyToken.saveAndGetToken(contractAddress, network)

          if (!tokenInfo) {
            return
          }

          if (TokenUtils.analyzeIfScamToken(tokenInfo?.name || '', tokenInfo?.symbol || '')) {
            return
          }

          const uniqueId = `${tx.hash}-${tx.category}-${tx.index || tx.transactionIndex}${tx.logIndex ? `-${tx.logIndex}` : ''}`

          return {
            from: ethers.getAddress(tx.from),
            to: ethers.getAddress(tx.to),
            value: ethers.formatUnits(tx.value, tokenInfo.decimals),
            blockNum: parseInt(tx.blockNumber),
            blockTimestamp: parseInt(tx.timeStamp),
            hash: tx.hash,
            category: tx.contractAddress
              ? ITransactionCategory.ERC20
              : tx.category === ITransactionCategory.External
                ? ITransactionCategory.External
                : ITransactionCategory.Internal,
            uniqueId,
            rawContract: {
              address: contractAddress,
              decimals: tokenInfo.decimals,
              name: tokenInfo.name,
              symbol: tokenInfo.symbol,
              priceUsd: tokenInfo.priceUsd,
              priceUpdatedAt: parseInt(tx.timeStamp),
              type: tokenInfo.type,
            },
            type:
              tx.from.toLowerCase() === address.toLowerCase() ? ITransactionType.withdraw : ITransactionType.deposit,
          }
        }),
      )

      const sortedTxList = parsedTransfers.filter(Boolean).sort((a: any, b: any) => a.blockNum - b.blockNum)
      await ProxyUtils.updateProgressInConfigIndexer(
        network,
        ConfigIndexerHelper.builders.transferList(network, address),
        sortedTxList[sortedTxList.length - 1]?.blockNum || 0,
      )
      return sortedTxList
    } catch (error) {
      logger.error('Error in fetchAddressTxns', llo({ error, address, network }))
      return []
    }
  },

  _fetchERC20Transfers: async (address: string, network: NetworksEnum, blockFilter: ITxFilterBlockArgs) => {
    const allTransactions: any[] = []
    let page = 1
    const offset = 100

    try {
      while (true) {
        const path = 'api'
        const params = {
          module: 'account',
          action: 'tokentx',
          address,
          page,
          offset,
          startblock: blockFilter.startBlock,
          endblock: blockFilter.endBlock,
        }

        const response = await ChilizProvider._rpcCall(path, params, network)

        if (response?.message !== 'OK' || !response?.result || response.result.length === 0) {
          break
        }

        const processedTxs = response.result.map((tx: any) => ({
          ...tx,
          category: ITransactionCategory.ERC20,
        }))

        allTransactions.push(...processedTxs)

        if (response.result.length < offset) {
          break
        }

        page++
      }

      return allTransactions
    } catch (error) {
      logger.error('Error fetching ERC20 transfers', llo({ error, address, network }))
      return []
    }
  },

  _fetchTxList: async (address: string, network: NetworksEnum, blockFilter: ITxFilterBlockArgs) => {
    const allTransactions: any[] = []
    let page = 1
    const offset = 100

    try {
      while (true) {
        const path = 'api'
        const params = {
          module: 'account',
          action: 'txlist',
          address,
          page,
          offset,
          startblock: blockFilter.startBlock,
          endblock: blockFilter.endBlock,
        }

        const response = await ChilizProvider._rpcCall(path, params, network)

        if (response?.message !== 'OK' || !response?.result || response.result.length === 0) {
          break
        }

        const validTransactions = response.result.filter(
          (tx: any) => tx.value && tx.value !== '0' && parseInt(tx.value) > 0,
        )

        const processedTxs = validTransactions.map((tx: any) => ({
          ...tx,
          contractAddress: null,
          category: ITransactionCategory.External,
        }))

        allTransactions.push(...processedTxs)

        if (response.result.length < offset) {
          break
        }

        page++
      }

      return allTransactions
    } catch (error) {
      logger.error('Error fetching external transactions', llo({ error, address, network }))
      return []
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
