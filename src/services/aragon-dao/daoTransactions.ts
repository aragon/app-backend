import {
  type HexAddress,
  type IAlchemyTransferResponse,
  IEnumIndexerService,
  ITransactionCategory,
  ITransactionType,
  NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Dao from '@models/schema/dao'
import type Transaction from '@models/schema/transaction'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'
import TokenUtils from '@helpers/tokenUtils'
import AlchemyWeb3 from '@helpers/alchemyWeb3'
import Web3Utils from '@helpers/web3Utils'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

/**
 * The DaoTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */
export const DaoTransactions = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    try {
      const startTime = Date.now()
      logger.verbose('Start DaoTransactions', llo({ daoAddress, startTime }))

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)
      if (!daoDb) return

      await DaoTransactions.onDocument(daoDb)

      const duration = Date.now() - startTime
      logger.verbose('End DaoTransactions', llo({ daoId: daoDb.id, daoAddress, duration: `${duration}ms` }))
    } catch (error) {
      logger.error('Error start DaoTransactions', llo({ daoAddress, error }))
    }
  },

  getCategories: (network: NetworksEnum) => {
    const category = [
      ITransactionCategory.ERC20,
      ITransactionCategory.ERC721,
      ITransactionCategory.ERC1155,
      ITransactionCategory.Internal,
      ITransactionCategory.External,
    ]

    switch (network) {
      case NetworksEnum.ethereumSepolia:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      case NetworksEnum.baseMainnet:
      case NetworksEnum.zksyncSepolia:
      case NetworksEnum.arbitrumMainnet:
      case NetworksEnum.zksyncMainnet:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      default:
        return category
    }
  },

  onDocument: async (dao: Dao) => {
    const category = DaoTransactions.getCategories(dao.network)
    // txs to daoAddress
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        toAddress: dao.address,
        fromBlock: dao.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        DaoTransactions.saveTransaction(txLog, ITransactionType.deposit, dao),
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
      onTx: async (txLog: IAlchemyTransferResponse) =>
        DaoTransactions.saveTransaction(txLog, ITransactionType.withdraw, dao),
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

  saveTransaction: async (tx: IAlchemyTransferResponse, type: ITransactionType, dao: Dao) => {
    const transactionReceipt = await Web3Helper.getTransactionReceipt(tx.hash, dao.network)
    if (!transactionReceipt) {
      return
    }

    try {
      /**
       * If the transaction is a proposal execution
       * We get two events from the DAO contract
       * - Executed (The address when the proposal was executed is the DAO address)
       * - ProposalExecuted (The proposalIndex is the topic of the log)
       */

      let daoAddress = dao.address
      let pluginAddress: string | undefined
      let proposalIndex: string | undefined

      const existingLog = await Models.Transaction.findExistingLog({
        transactionHash: tx.hash,
        network: dao.network,
        category: tx.category,
        uniqueId: tx.uniqueId,
      })

      if (existingLog) {
        logger.verbose('Transaction already saved', llo({ logId: existingLog.id }))
        return
      }

      const proposalExecutionLog = Web3Utils.findLogsByName(transactionReceipt, 'Executed', DAO.abi)
      if (proposalExecutionLog?.length > 0) {
        daoAddress = proposalExecutionLog[0].txLog.address

        const proposalIdLog = Web3Utils.findLogsByName(transactionReceipt, 'ProposalExecuted', Multisig.abi)
        pluginAddress = proposalIdLog[0].txLog.address

        if (proposalIdLog?.length > 0) {
          proposalIndex = proposalIdLog[0].txLog.topics[1].toString()
        }
      }

      if (tx.rawContract?.address) {
        const isTokenSyncable = await TokenUtils.isTokenSyncable(tx.rawContract?.address, dao.network)
        if (!isTokenSyncable) {
          logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: tx.rawContract?.address }))
          return
        }
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(Number(tx.blockNum), dao.network)
      const tokenAddress = tx.rawContract?.address || utils.zeroAddress
      const token = await ProxyToken.saveAndGetToken(tokenAddress, dao.network)

      // check if alchemy return strange balance
      AlchemyWeb3.alchemyCrazyBalanceOnError(daoAddress, token?.address!, dao.network, tx.value, token?.decimals!)

      const rawTx: Partial<Transaction> = {
        transactionHash: tx.hash,
        uniqueId: tx.uniqueId,
        blockNumber: Number(tx.blockNum),
        blockTimestamp,
        network: dao.network,
        type,
        daoAddress,
        pluginAddress,
        fromAddress: tx.from,
        toAddress: tx.to,
        value: AlchemyWeb3.handleAlchemyCrazyBalance(tx.value || 0, token?.decimals, tx),
        tokenId: tx.tokenId ? BigInt(tx.tokenId).toString() : undefined,
        erc721TokenId: tx.erc721TokenId ? BigInt(tx.erc721TokenId).toString() : undefined,
        erc1155Metadata: tx.erc1155Metadata?.map(w => ({
          tokenId: BigInt(w.tokenId)?.toString(),
          value: w.value?.toString(),
        })),
        category: tx.category,
        proposalIndex,
      }

      if (token?.address) {
        rawTx.tokenAddress = token.address
        // historical price
        const daysDifference = utils.calculateDaysDifference(rawTx.blockTimestamp! * 1000)
        const tokenRate = await RateModule.fetchRate(token.address, dao.network, daysDifference)
        const priceUsd = Number(tokenRate?.priceUsd || 0)
        rawTx.amountUsd = DaoTransactions.calculateAmountUsd(Number(rawTx.value || 0), priceUsd)

        rawTx.token = {
          network: token.network,
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          type: token.type,
          logo: token.logo,
          decimals: token.decimals,
          snapshot: {
            priceUsd: priceUsd.toString(),
            priceUpdatedAt: blockTimestamp,
          },
        }
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
        return logDb
      })
    } catch (error) {
      logger.error('Error saveTransaction', llo({ error, logId: dao.id, txHash: tx.hash }))
    }
  },

  calculateAmountUsd: (rawValue: number, ratePriceUsd: number): string => {
    const amountUsd = Number(rawValue) * Number(ratePriceUsd)
    return isNaN(amountUsd) ? '0' : amountUsd.toLocaleString('en', { maximumFractionDigits: 2, useGrouping: false })
  },
}
