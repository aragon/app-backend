import SubscanApi from '@helpers/subscanApi'
import {
  type ISubScanTokenInfo,
  type ITokenMetrics,
  ITokenType,
  ITransactionCategory,
  ITransactionType,
  type IWeb3Provider,
  type NetworksEnum,
} from '@types'
import utils from '@helpers/utils'
import logger from '@logger'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import ProxyUtils from '@modules/proxyProvider/utils'
import dayjs from 'dayjs'
import BottleneckModule from '@modules/bottleneck'

const llo = logger.logMeta.bind(null, { service: 'provider:PeaqTokenProvider' })

const PeaqProvider: Omit<IWeb3Provider, 'getNativeBalance'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokens = await SubscanApi.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },

  async fetchContractCreation({ address, network }) {
    const contractInfo = await SubscanApi.fetchContractCreation(address, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address }
  },

  async fetchContractSourceCode({ address, network }) {
    return SubscanApi.getContractSourceCode(address, network)
  },

  async fetchBasicTokenInfo({ address, network }): Promise<Partial<ISubScanTokenInfo>> {
    return address === utils.zeroAddress
      ? await SubscanApi.getNativeTokenInfo(network)
      : await SubscanApi.getTokenFullDetails(address, network)
  },

  async fetchTokenHolderAndSupply({ address, network }): Promise<ITokenMetrics> {
    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return {
      totalHolders: tokenInfo.totalHolders,
      totalSupply: tokenInfo.totalSupply,
    }
  },

  async fetchAddressTxns({ address, network }: { address: string; network: NetworksEnum }): Promise<any> {
    const assetTransfers = await SubscanApi.getAssetTransfer(address, network)
    const parsedTransfers = await Promise.all(
      assetTransfers.map(async tx => {
        const contractAddress = tx.rawContract?.address || utils.zeroAddress
        const tokenInfo = await ProxyToken.saveAndGetToken(contractAddress, network)

        if (!tokenInfo) {
          logger.error('Token not found', llo({ address, network, contractAddress }))
          return
        }

        const transferLog = {
          from: tx.from,
          to: tx.to,
          value:
            tx.category === ITransactionCategory.External
              ? tx.value
              : ethers.formatUnits(tx.value!, tokenInfo.decimals),
          blockNum: tx.blockNum,
          blockTimestamp: tx.blockTimestamp,
          hash: tx.hash,
          category: tx.category,
          uniqueId: tx.uniqueId,
          rawContract: {
            address: contractAddress,
            decimals: tokenInfo.decimals,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd: tokenInfo.priceUsd,
            priceUpdatedAt: tx.blockTimestamp,
            type: tokenInfo.type,
          },
          type: tx.from === address ? ITransactionType.withdraw : ITransactionType.deposit,
        }

        if (TokenUtils.analyzeIfScamToken(tokenInfo?.name || '', tokenInfo?.symbol || '')) {
          return
        }

        transferLog.value =
          tx.category === 'external'
            ? tx.value
            : ethers.formatUnits(tx.value!, tx?.rawContract?.decimals || 0).toString()

        return transferLog
      }),
    )

    return parsedTransfers.filter(Boolean)
  },

  fetchTokenPrice: async ({ address, network, pastDays }: any): Promise<any> => {
    if (address === utils.zeroAddress) {
      const price = await SubscanApi.getCurrentPrice(network, pastDays || 30)
      return {
        priceUsd: price || '0',
      }
    }

    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return {
      priceUsd: tokenInfo.priceUsd || '0',
    }
  },

  searchDetailsOfContract: async ({ address, network }) => {
    const sourceCode = await SubscanApi.getContractSourceCode(address, network)
    if (Array.isArray(sourceCode) && sourceCode.length === 1) {
      return {
        name: sourceCode[0]?.ContractName || null,
      }
    }
    const fallbackDetails = await SubscanApi.getTokenFullDetails(address, network)
    if (fallbackDetails) {
      return {
        name: fallbackDetails.name || '',
        type: 'token',
      }
    }

    return {
      name: null,
      type: ITokenType.unknown,
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
    const initialPage = syncProgress ? syncProgress.lastSync + 1 : 0

    try {
      return await SubscanApi.getAllTokenHolders(
        address,
        network,
        { pageSize: 100, delayMs: 500, startPage: initialPage },
        async (holders, pageInfo) => {
          await Promise.all(holders.map(async holder => await callback(holder)))

          if (syncKey) {
            await ProxyUtils.updateProgressInConfigIndexer(network, syncKey, pageInfo.currentPage, pageInfo.isLastPage)
          }
        },
      )
    } catch (error) {
      logger.error('Error in getAllTokenHolders', llo({ error, address, network }))
    }
  },
  fetchHistoricalTokenPrice: async ({ address, network, date }: any) => {
    if (address === utils.zeroAddress) {
      const pastDays = date ? Math.round(dayjs.utc().diff(dayjs.utc(date), 'days')) : 30
      const price = await SubscanApi.getCurrentPrice(network, pastDays)
      return price || '0'
    }

    const tokenInfo = await SubscanApi.getTokenFullDetails(address, network)
    return tokenInfo.priceUsd || '0'
  },

  getTokenCounters: async ({ address, network }) => {
    return await SubscanApi.getTokenCounters(address, network)
  },

  getNetworkBottleneck: (network: NetworksEnum) => {
    return BottleneckModule.getNodeLimiter(network)
  },
}

export default PeaqProvider
