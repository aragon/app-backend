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

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

/**
 * The DaoTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */
export const DaoTransactions = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    const startTime = Date.now()
    logger.verbose('Start DaoTransactions', llo({ startTime }))

    const daoDb = await Models.Dao.findByAddress(daoAddress, network)
    if (!daoDb) return
    await DaoTransactions.onDocument(daoDb)

    const duration = Date.now() - startTime
    logger.verbose('End DaoTransactions', llo({ daoId: daoDb.id, duration: `${duration}ms` }))
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
      logService: `Deposit-${dao.address}-${IEnumIndexerService.depositTxs}` as any,
      stopOnError: true,
    })
    await depositTxCrawler.crawl()

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        fromAddress: dao.address,
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
      logService: `Withdraw-${dao.address}-${IEnumIndexerService.withdrawTxs}` as any,
      stopOnError: true,
    })
    await withdrawTxCrawler.crawl()
  },

  saveTransaction: async (tx: IAlchemyTransferResponse, type: ITransactionType, dao: Dao) => {
    try {
      const transactionReceipt = await Web3Helper.getTransactionReceipt(tx.hash, dao.network)
      if (!transactionReceipt) {
        return
      }

      /**
       * If the transaction is a proposal execution
       * We get two events from the DAO contract
       * - Executed (The address when the proposal was executed is the DAO address)
       * - ProposalExecuted (The proposalIndex is the topic of the log)
       */

      let daoAddress = dao.address
      let pluginAddress: string | undefined
      let proposalIndex: number | undefined

      const proposalExecutionLog = Web3Helper.findLogsByName(transactionReceipt, 'Executed', DAO.abi)
      if (proposalExecutionLog?.length) {
        daoAddress = proposalExecutionLog[0].txLog.address

        const proposalIdLog = Web3Helper.findLogsByName(transactionReceipt, 'ProposalExecuted', Multisig.abi)
        pluginAddress = proposalIdLog[0].txLog.address

        if (proposalIdLog?.length) {
          proposalIndex = Number(proposalIdLog[0].txLog.topics[1])
        }
      }

      const existingTxDb = await Models.Transaction.findExistingLog({
        transactionHash: tx.hash,
        category: tx.category,
        network: dao.network,
      })

      if (existingTxDb) {
        return
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(Number(tx.blockNum), dao.network)
      const tokenAddress = tx.rawContract?.address || utils.zeroAddress
      const token = await ProxyToken.saveAndGetToken(tokenAddress, dao.network)

      await DbTx.executeTxFn(async ({ session }) => {
        const rawTx: Partial<Transaction> = {
          transactionHash: tx.hash,
          blockNumber: Number(tx.blockNum),
          blockTimestamp,
          network: dao.network,
          type,
          daoAddress,
          pluginAddress,
          fromAddress: tx.from,
          toAddress: tx.to,
          value: Web3Helper.handleAlchemyCrazyBalance(tx.value || 0, token?.decimals, tx),
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
          const daysDifference = utils.calculateDaysDifference(rawTx.blockTimestamp)
          const tokenRate = await RateModule.fetchRate(token.address, dao.network, daysDifference)
          rawTx.amountUsd = DaoTransactions.calculateAmountUsd(
            Number(rawTx.value || 0),
            Number(tokenRate.priceUsd || 0),
          )

          rawTx.token = {
            network: token.network,
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            type: token.type,
            logo: token.logo,
            decimals: token.decimals,
            snapshot: {
              priceUsd: tokenRate.priceUsd,
              priceUpdatedAt: blockTimestamp,
            },
          }
        }

        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
      })
    } catch (error) {
      logger.error('Error Transaction', llo({ error, logId: dao.id }))
    }
  },

  calculateAmountUsd: (rawValue: number, ratePriceUsd: number): string => {
    const amountUsd = Number(rawValue) * Number(ratePriceUsd)
    return isNaN(amountUsd) ? '0' : amountUsd.toLocaleString('en', { maximumFractionDigits: 2, useGrouping: false })
  },
}
