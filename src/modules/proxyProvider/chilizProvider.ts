import logger from '@logger'
import {
  type ISubScanTokenInfo,
  type ITokenMetrics,
  ITokenType,
  type ITxFilterBlockArgs,
  type IWeb3Provider,
  type NetworksEnum,
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

const llo = logger.logMeta.bind(null, { service: 'provider:ChilizProvider' })

const ChilizProvider: Omit<IWeb3Provider, 'getNativeBalance'> & {
  _rpcCall: any
  _fetchInternalTxs: any
  _fetchTxList: any
  _fetchERC20Transfers: any
  getTokenHoldersPage: any
  _getAllTokenHolders: any
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

  fetchContractCreation: async ({ address }) => {
    return { blockNumber: 0, transactionHash: null, address }
  },

  fetchContractSourceCode: async ({ address, network }) => {
    const path = 'api'
    const params = {
      module: 'contract',
      action: 'getsourcecode',
      address,
    }

    try {
      const response = await ChilizProvider._rpcCall(path, params, network)
      if (
        response?.message === 'OK' &&
        response?.result.length &&
        response?.result[0]?.SourceCode &&
        response?.result[0]?.SourceCode !== ''
      ) {
        return [
          {
            SourceCode: response!.result[0].SourceCode || '',
            ContractName: response!.result[0].ContractName,
            ABI: JSON.stringify(response!.result[0].ABI),
          },
        ]
      }
    } catch (error: any) {
      logger.warn('Chiliz Provider contract source code api failed', llo({ error, path, params }))
    }

    return null
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
      const lastSyncStat = await ProxyUtils.getProgressFromConfigIndexer(network, `transferList-${address}-${network}`)
      const latestBlock = await Web3Helper.getBlockNumber(undefined, network)
      const blockFilter: ITxFilterBlockArgs = {
        startBlock: lastSyncStat?.lastSync ? lastSyncStat.lastSync + 1 : 0,
        endBlock: latestBlock,
      }

      const [erc20Transfers, externalTransfers, internalTxs] = await Promise.all([
        ChilizProvider._fetchERC20Transfers(address, network, blockFilter),
        ChilizProvider._fetchTxList(address, network, blockFilter),
        ChilizProvider._fetchInternalTxs(address, network, blockFilter),
      ])

      const allTransactions = [...erc20Transfers, ...externalTransfers, ...internalTxs]

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

          return {
            from: ethers.getAddress(tx.from),
            to: ethers.getAddress(tx.to),
            value: ethers.formatUnits(tx.value, tokenInfo.decimals),
            blockNum: parseInt(tx.blockNumber),
            blockTimestamp: parseInt(tx.timeStamp),
            hash: tx.hash,
            category: tx.contractAddress
              ? ITransactionCategory.ERC20
              : tx.category === 'external'
                ? ITransactionCategory.External
                : ITransactionCategory.Internal,
            uniqueId: `${tx.hash}-${tx.category}-${tx.index || tx.transactionIndex}${tx.logIndex ? `-${tx.logIndex}` : ''}`,
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
        `transferList-${address}-${network}`,
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

        allTransactions.push(...response.result)

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
          category: 'external',
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

  _fetchInternalTxs: async (address: string, network: NetworksEnum, blockFilter: ITxFilterBlockArgs) => {
    const allInternalTxs: any[] = []
    let page = 1
    const offset = 100

    try {
      while (true) {
        const path = 'api'
        const params = {
          module: 'account',
          action: 'txlistinternal',
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

        const validInternalTxs = response.result.filter(
          (tx: any) => tx.type === 'call' && tx.value && tx.value !== '0' && parseInt(tx.value) > 0,
        )

        const processedTxs = validInternalTxs.map((tx: any) => ({
          ...tx,
          contractAddress: null,
          category: 'internal',
          hash: tx.transactionHash,
        }))

        allInternalTxs.push(...processedTxs)

        if (response.result.length < offset) {
          break
        }

        page++
      }

      return allInternalTxs
    } catch (error) {
      logger.error('Error fetching internal transactions', llo({ error, address, network }))
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

  getAllTokenHolders: async ({
    address,
    network,
    callback,
    syncKey,
  }: {
    address: string
    network: NetworksEnum
    callback: ({ address, value }: { address: string; value: string }) => Promise<void> | void
    syncKey?: string
  }) => {
    const syncProgress = await ProxyUtils.getProgressFromConfigIndexer(network, syncKey)
    if (syncProgress?.end) {
      return
    }
    const initialPage = syncProgress ? syncProgress.lastSync + 1 : 1

    try {
      return await ChilizProvider._getAllTokenHolders(
        address,
        network,
        { pageSize: 100, delayMs: 500, startPage: initialPage },
        async (holders: any, pageInfo: any) => {
          await Promise.all(holders.map(async (holder: any) => await callback(holder)))

          if (syncKey) {
            await ProxyUtils.updateProgressInConfigIndexer(network, syncKey, pageInfo.currentPage, pageInfo.isLastPage)
          }
        },
      )
    } catch (error) {
      logger.error('Error in getAllTokenHolders', llo({ error, address, network }))
    }
  },

  getTokenHoldersPage: async (
    tokenAddress: string,
    network: NetworksEnum,
    page: number = 1,
    pageSize: number = 100,
  ) => {
    try {
      const path = 'api'
      const params = {
        module: 'token',
        action: 'getTokenHolders',
        contractaddress: tokenAddress,
        page,
        offset: pageSize,
      }

      const response = await ChilizProvider._rpcCall(path, params, network)

      if (response?.message === 'OK' && Array.isArray(response?.result) && response.result.length > 0) {
        return {
          holders: response.result.map((item: any) => ({
            address: item.address,
            value: item.value,
          })),
          total: response.result.length,
        }
      }

      return { holders: [], total: 0 }
    } catch (error) {
      logger.error('Error fetching token holders page', llo({ error, page, tokenAddress }))
      return { holders: [], total: 0 }
    }
  },

  _getAllTokenHolders: async (
    tokenAddress: string,
    network: NetworksEnum,
    options = {
      pageSize: 100,
      delayMs: 500,
      startPage: 1,
    },
    callback?: (
      holders: Array<{ address: string; value: string }>,
      pageInfo: { currentPage: number; isLastPage: boolean; total: number },
    ) => Promise<void> | void,
  ) => {
    try {
      const allHolders: Array<{ address: string; value: string }> = []
      let page = options.startPage || 1
      let hasMoreData = true

      while (hasMoreData) {
        const pageResult = await ChilizProvider.getTokenHoldersPage(tokenAddress, network, page, options.pageSize)

        if (!pageResult.holders || pageResult.holders.length === 0) {
          hasMoreData = false
          break
        }

        const isLastPage = pageResult.holders.length < options.pageSize

        if (callback) {
          await callback(pageResult.holders, {
            currentPage: page,
            isLastPage,
            total: pageResult.total,
          })
        }

        allHolders.push(...pageResult.holders)

        if (isLastPage) {
          hasMoreData = false
        } else {
          page++
          await utils.wait(options.delayMs)
        }
      }

      return {
        holders: allHolders,
        total: allHolders.length,
        hasMore: hasMoreData,
        lastPage: page,
      }
    } catch (error) {
      logger.error('Error _getAllTokenHolders', llo({ error, tokenAddress }))
      return { holders: [], total: 0, hasMore: false, lastPage: options.startPage }
    }
  },

  _rpcCall: async (path: string, params: any, network: NetworksEnum) => {
    const baseUrl = 'https://scan.chiliz.com'

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
    const path = 'token-counters'
    const params = {
      id: address,
    }

    try {
      const response = await ChilizProvider._rpcCall(path, params, network)

      if (response?.token_holder_count) {
        return {
          transfers: response?.token_holder_count,
          holders: response?.token_holders,
        }
      }
    } catch (error: any) {
      logger.warn('Chiliz Provider token-counter api failed', llo({ error, path, params }))
    }

    return {
      transfers: 0,
      holders: 0,
    }
  },
  fetchHistoricalTokenPrice: async () => {
    return '0'
  },
}

export default ChilizProvider
