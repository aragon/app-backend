import {
  EnumConnection,
  type IAlchemyTransferResponse,
  IEnumIndexerService,
  type IService,
  ITransactionType,
} from '@types'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

import logger from '@logger'
import { NetworkHelper } from '@helpers/network'
import DBCrawler from '@models/utils/crawler'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'

const llo = logger.logMeta.bind(null, { service: 'tools:manualSyncDaoTransactions' })

interface IDaoTransactionsTools extends IService {
  onDocument: any
  fixOldTransactions: any
}
export const ToolsManualSyncDaoTransactions: IDaoTransactionsTools = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const dbCrawler = new DBCrawler({
          model: Models.Transaction,
          onDocument: ToolsManualSyncDaoTransactions.onDocument,
          onError: (error: any, document: any) => {
            logger.error('Error Sync all Transaction', { document, error })
          },
          batchSize: 500,
          concurrency: 10,
          useAggregate: true,
          aggregate: (_skip: number | undefined, _limit: number | undefined) => {
            return [
              {
                $match: {
                  network: networkName,
                },
              },
              {
                $group: {
                  _id: {
                    daoAddress: '$daoAddress',
                    network: '$network',
                  },
                },
              },
              {
                $skip: _skip ?? 0,
              },
              {
                $limit: _limit ?? 500,
              },
              {
                $project: {
                  _id: 0,
                  daoAddress: '$_id.daoAddress',
                  network: '$_id.network',
                },
              },
            ]
          },
        })

        await dbCrawler.crawl()
      }),
    )
  },
  onDocument: async (dao: any) => {
    const daoDb = await Models.Dao.findByAddress(dao.daoAddress, dao.network)
    if (!daoDb) return

    // fix block number first
    const logDepositService = `deposit-${dao.address}-${IEnumIndexerService.depositTxs}`
    const depoConfigIndexerDb = await Models.ConfigIndexer.findOne({
      service: logDepositService,
      network: dao.network,
    })

    await depoConfigIndexerDb?.update({
      lastSync: daoDb.blockNumber,
    })

    const logWithdrawService = `withdraw-${dao.address}-${IEnumIndexerService.withdrawTxs}`
    const withdrawConfigIndexerDb = await Models.ConfigIndexer.findOne({
      service: logWithdrawService,
      network: dao.network,
    })

    await withdrawConfigIndexerDb?.update({
      lastSync: daoDb.blockNumber,
    })

    logger.verbose('Previous block number cleard', llo({ dao: dao.daoAddress }))

    const category = DaoTransactions.getCategories(dao.network)
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        toAddress: dao.address,
        fromBlock: dao.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        await ToolsManualSyncDaoTransactions.fixOldTransactions(txLog, daoDb)
        await DaoTransactions.saveTransaction(txLog, ITransactionType.deposit, daoDb)
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

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: dao.network,
      filter: {
        fromAddress: dao.address,
        fromBlock: dao.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        await ToolsManualSyncDaoTransactions.fixOldTransactions(txLog, daoDb)
        return await DaoTransactions.saveTransaction(txLog, ITransactionType.withdraw, daoDb)
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

    await Promise.all([depositTxCrawler.crawl(), withdrawTxCrawler.crawl()])
  },

  fixOldTransactions: async (txLog: IAlchemyTransferResponse, dao: any) => {
    const oldTx = await Models.Transaction.findOne({
      transactionHash: txLog.hash,
      network: dao.network,
    })

    if (oldTx && !oldTx.uniqueId) {
      await oldTx.remove()
      logger.info('Remove old transaction', llo({ txLog, dao: dao.address }))
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoTransactions
