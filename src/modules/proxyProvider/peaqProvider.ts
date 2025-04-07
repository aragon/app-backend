import SubscanApi from '@helpers/subscanApi'
import {
  type ISubScanTokenInfo,
  type ITokenMetrics,
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

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
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
    const tokenInfo =
      address === utils.zeroAddress
        ? await SubscanApi.getNativeTokenInfo(network)
        : await SubscanApi.getTokenFullDetails(address, network)
    return tokenInfo
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
    return await Promise.all(
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
  },

  fetchTokenPrice: async ({ network, pastDays }: any): Promise<any> => {
    const price = await SubscanApi.getCurrentPrice(network, pastDays || 30)
    return {
      priceUsd: price || '0',
    }
  },
}

export default PeaqProvider
