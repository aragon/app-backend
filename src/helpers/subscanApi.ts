import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import {
  type HexAddress,
  type ISubScanAssetTransfer,
  type ISubScanContractCreation,
  type ISubScanNativeTokenInfo,
  type ISubScanTokenBalance,
  type ISubScanTokenInfo,
  ITokenType,
  ITransactionCategory,
  type NetworksEnum,
} from '@types'
import { ethers } from 'ethers'
import utils from '@helpers/utils'
import dayjs from '@helpers/dayjs'

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
        BottleneckModule.getBlockScoutLimiter(network).schedule(async () =>
          SubscanApiHelper.axiosInstance(network).post(replacedPath || `api/scan/${path}`, params),
        ),
      )
      return response?.data
    } catch (error) {
      logger.warn('SubscanApi API call', llo({ error, path, params }))
      throw error
    }
  },

  getAssetTransfer: async (address: HexAddress, network: NetworksEnum): Promise<ISubScanAssetTransfer[]> => {
    const substrateAddress = await SubscanApiHelper.getAccountInfoByKey(address, network)
    if (!substrateAddress) return []

    const nativeTransfers = await SubscanApiHelper._fetchAllPaginatedItems(
      'transfers',
      { address: substrateAddress, row: 100 },
      network,
      'api/v2/scan/transfers',
      res => res?.data?.transfers || [],
    )

    const erc20Transfers = await SubscanApiHelper._fetchAllPaginatedItems(
      'evm/token/transfer',
      { address, row: 100, category: 'erc20' },
      network,
    )

    const parsedNative = nativeTransfers.map(SubscanApiHelper._parseNativeTransfer)
    const parsedErc20 = await Promise.all(
      erc20Transfers.map(async tx => SubscanApiHelper._parseErc20Transfer(tx, network)),
    )

    return [...parsedNative, ...parsedErc20].sort((a, b) => b.blockNum - a.blockNum)
  },

  _fetchAllPaginatedItems: async (
    path: string,
    baseParams: any,
    network: NetworksEnum,
    replacedPath?: string,
    extractListFn: (res: any) => any[] = res => res?.data?.list || [],
    extractTotalFn: (res: any) => number = res => res?.data?.count || 0,
  ) => {
    const pageSize = baseParams.row || 100
    let page = 0
    let allItems: any[] = []

    while (true) {
      const params = { ...baseParams, page, row: pageSize }
      const res = await SubscanApiHelper._rpCall(path, params, network, replacedPath)
      const list = extractListFn(res)
      const total = extractTotalFn(res)

      allItems = allItems.concat(list)
      if (allItems.length >= total || list.length === 0) break

      page++
    }

    return allItems
  },

  _parseNativeTransfer: (transfer: any): ISubScanAssetTransfer => ({
    blockNum: transfer.block_num,
    from: ethers.getAddress(transfer.from_account_display.evm_address || ethers.ZeroAddress),
    to: ethers.getAddress(transfer.to_account_display?.evm_address || ethers.ZeroAddress),
    uniqueId: transfer.transfer_id,
    blockTimestamp: transfer.block_timestamp,
    value: transfer.amount,
    hash: transfer.hash,
    category: ITransactionCategory.External,
  }),

  _parseErc20Transfer: async (transfer: any, network: NetworksEnum): Promise<ISubScanAssetTransfer> => {
    const txDetails = await SubscanApiHelper.getTransactionInfoByHash(transfer.hash, network)

    return {
      blockNum: txDetails.block_num,
      from: ethers.getAddress(transfer.from),
      to: ethers.getAddress(transfer.to),
      uniqueId: transfer.id,
      blockTimestamp: txDetails.block_timestamp,
      value: transfer.value,
      hash: transfer.hash,
      category: ITransactionCategory.ERC20,
      rawContract: {
        value: transfer.value,
        address: ethers.getAddress(transfer.contract),
        decimals: transfer.decimals,
        name: transfer.name,
        symbol: transfer.symbol,
        priceUsd: transfer.price || '0',
      },
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
      totalHolders: 0,
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
        tokenDetails.totalHolders = tokenInfo.holders
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
      totalHolders: 0,
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
        tokenResponse.totalHolders = response.data.token.holders
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

  getTokenHoldersPage: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    page: number = 0,
    pageSize: number = 100,
  ) => {
    try {
      const networkConfig = SubscanApiHelper._parseNetworkToConfig(network)
      if (!networkConfig?.SUBSCAN_API_URL) {
        logger.warn('Subscan API is not configured', llo({ network }))
        return { holders: [], total: 0 }
      }

      const params = {
        contract: tokenAddress,
        page,
        row: pageSize,
      }

      const response = await SubscanApiHelper._rpCall('evm/token/holders', params, network)

      if (response?.code === 0 && Array.isArray(response?.data?.list) && response.data.list.length > 0) {
        const holders = response.data.list.map((item: any) => ({
          address: ethers.getAddress(item.holder),
          value: item.balance,
        }))

        return {
          holders,
          total: response.data.count || holders.length,
        }
      }

      return { holders: [], total: 0 }
    } catch (error) {
      logger.error('Error fetching token holders page', llo({ error, page, tokenAddress }))
      return { holders: [], total: 0 }
    }
  },

  async getAllTokenHolders(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    options = {
      pageSize: 100,
      delayMs: 500,
      startPage: 0,
    },
    callback?: (
      holders: Array<{ address: string; value: string }>,
      pageInfo: { currentPage: number; total: number; isLastPage: boolean },
    ) => Promise<void> | void,
  ) {
    try {
      const networkConfig = SubscanApiHelper._parseNetworkToConfig(network)
      if (!networkConfig?.SUBSCAN_API_URL) {
        logger.warn('Subscan API is not configured', llo({ network }))
        return { holders: [], total: 0, hasMore: false, lastPage: 0 }
      }

      const allHolders: Array<{ address: string; value: string }> = []
      let page = options.startPage || 0
      let hasMoreData = true
      let totalItems = 0

      while (hasMoreData) {
        const pageResult = await SubscanApiHelper.getTokenHoldersPage(tokenAddress, network, page, options.pageSize)

        if (!pageResult.holders || pageResult.holders.length === 0) {
          hasMoreData = false
          break
        }

        if (page === 0) {
          totalItems = pageResult.total
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
        total: totalItems || allHolders.length,
        hasMore: hasMoreData,
        lastPage: page,
      }
    } catch (error) {
      logger.error('Error getAllTokenHolders', llo({ error, tokenAddress }))
      return { holders: [], total: 0, hasMore: false, lastPage: options.startPage }
    }
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
        tokenCounter.holders = tokenFullInfo.totalHolders
        return tokenCounter
      }
    } catch (error) {
      logger.warn('SubscanApi getTokenCounters', llo({ error, address }))
    }
    return tokenCounter
  },
}

export default SubscanApiHelper
