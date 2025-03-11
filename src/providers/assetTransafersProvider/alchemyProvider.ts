import {
  type IAlchemyTransferResponse,
  type IAssetTransferProvider,
  type IAssetTransferTxLog,
  IEnumIndexerService,
  ITransactionCategory,
  ITransactionType,
  NetworksEnum,
} from '@types'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import { RateModule } from '@modules/rates'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
const llo = logger.logMeta.bind(null, { service: 'providers:alchemy-transfers' })

export const AlchemyProvider: IAssetTransferProvider & {
  getCategories: (network: NetworksEnum) => ITransactionCategory[]
  formatTxLog: (txLog: IAlchemyTransferResponse, network: NetworksEnum) => any
  calculateAmountUsd: (rawValue: number, ratePriceUsd: number) => string
} = {
  getCategories: (network: NetworksEnum) => {
    const category = [
      ITransactionCategory.ERC20,
      ITransactionCategory.ERC721,
      ITransactionCategory.ERC1155,
      ITransactionCategory.Internal,
      ITransactionCategory.External,
    ]

    switch (network) {
      case NetworksEnum.baseMainnet:
      case NetworksEnum.zksyncSepolia:
      case NetworksEnum.arbitrumMainnet:
      case NetworksEnum.zksyncMainnet:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      default:
        return category
    }
  },
  async getAssetTransfers(dao: Dao, onTx: any) {
    const category = AlchemyProvider.getCategories(dao.network)
    // txs to daoAddress
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        toAddress: dao.address,
        fromBlock: dao.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        const formattedLog = await AlchemyProvider.formatTxLog(txLog, dao.network)
        if (!formattedLog) return
        await onTx(formattedLog, ITransactionType.deposit, dao)
      },
      onError: async (error: any) => {
        logger.error(
          'Error deposit transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: dao.id, network: dao.network }),
        )
      },
      logService: `deposit-${dao.address}-${IEnumIndexerService.depositTxs}` as any,
      stopOnError: true,
    })
    await depositTxCrawler.crawl()

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        fromAddress: dao.address,
        fromBlock: dao.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        const formattedLog = await AlchemyProvider.formatTxLog(txLog, dao.network)
        if (!formattedLog) return
        await onTx(formattedLog, ITransactionType.withdraw, dao)
      },
      onError: async (error: any) => {
        logger.error(
          'Error withdraw transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: dao.id, network: dao.network }),
        )
      },
      logService: `withdraw-${dao.address}-${IEnumIndexerService.withdrawTxs}` as any,
      stopOnError: true,
    })
    await withdrawTxCrawler.crawl()
  },
  async formatTxLog(txLog: IAlchemyTransferResponse, network: NetworksEnum) {
    try {
      const transferLog: IAssetTransferTxLog = {
        hash: txLog.hash,
        from: txLog.from,
        uniqueId: txLog.uniqueId,
        to: txLog.to,
        value: txLog.value!,
        blockNum: Number(txLog.blockNum),
        category: txLog.category,
        blockTimestamp: await Web3Helper.getBlockTimestamp(Number(txLog.blockNum), network),
        tokenId: txLog.tokenId ? BigInt(txLog.tokenId).toString() : undefined,
        erc721TokenId: txLog.erc721TokenId ? BigInt(txLog.erc721TokenId).toString() : undefined,
        erc1155Metadata: txLog.erc1155Metadata?.map(w => ({
          tokenId: BigInt(w.tokenId)?.toString(),
          value: w.value?.toString(),
        })),
      }

      if (txLog.rawContract?.address) {
        const isTokenSyncable = await TokenUtils.isTokenSyncable(txLog.rawContract?.address, network)

        if (!isTokenSyncable) {
          logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: txLog.rawContract?.address }))
          return
        }
      }

      const tokenAddress = txLog.rawContract?.address || utils.zeroAddress
      const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
      if (!token) {
        return
      }
      Web3Helper.alchemyCrazyBalanceOnError(txLog.hash, token?.address, network, transferLog.value, token?.decimals)
      const price = await RateModule.fetchRate(token?.address, network)
      const priceUsd = Number(price?.priceUsd || 0)

      transferLog.rawContract = {
        address: token?.address,
        decimals: token?.decimals,
        name: token?.name,
        symbol: token?.symbol,
        priceUsd: priceUsd.toString(),
        priceUpdatedAt: transferLog.blockTimestamp,
        type: token?.type,
        logo: token?.logo,
      }

      transferLog.value = Web3Helper.handleAlchemyCrazyBalance(transferLog.value || 0, token?.decimals, transferLog)

      transferLog.rawContract.priceUsd = priceUsd.toString()
      return transferLog
    } catch (error) {
      logger.error('Error formatting tx log', llo({ error, txLog }))
    }
  },

  calculateAmountUsd: (rawValue: number, ratePriceUsd: number): string => {
    const amountUsd = Number(rawValue) * Number(ratePriceUsd)
    return isNaN(amountUsd) ? '0' : amountUsd.toLocaleString('en', { maximumFractionDigits: 2, useGrouping: false })
  },
}
