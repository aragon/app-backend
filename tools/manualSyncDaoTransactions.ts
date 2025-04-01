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
import { AlchemyProvider } from '@providers/assetTransafersProvider/alchemyProvider'

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
    const logDepositService = `deposit-${daoDb.address}-${IEnumIndexerService.depositTxs}`
    const depoConfigIndexerDb = await Models.ConfigIndexer.findOne({
      service: logDepositService,
      network: daoDb.network,
    })

    if (depoConfigIndexerDb) {
      await depoConfigIndexerDb?.update({
        lastSync: daoDb.blockNumber,
      })
    }

    const logWithdrawService = `withdraw-${daoDb.address}-${IEnumIndexerService.withdrawTxs}`
    const withdrawConfigIndexerDb = await Models.ConfigIndexer.findOne({
      service: logWithdrawService,
      network: daoDb.network,
    })

    if (withdrawConfigIndexerDb) {
      await withdrawConfigIndexerDb?.update({
        lastSync: daoDb.blockNumber,
      })
    }

    logger.verbose('Previous block number cleard', llo({ dao: daoDb.daoAddress }))

    const category = AlchemyProvider.getCategories(daoDb.network)
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: daoDb.network,
      filter: {
        toAddress: daoDb.address,
        fromBlock: daoDb.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        await ToolsManualSyncDaoTransactions.fixOldTransactions(txLog, daoDb)
        await DaoTransactions.saveTransaction(txLog as any, ITransactionType.deposit, daoDb)
      },

      onError: async (error: any) => {
        logger.error(
          'Error deposit transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: daoDb.id, network: daoDb.network }),
        )
      },
      logService: `deposit-${daoDb.address}-${IEnumIndexerService.depositTxs}` as any,
      stopOnError: true,
    })

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: daoDb.network,
      filter: {
        fromAddress: daoDb.address,
        fromBlock: daoDb.blockNumber,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) => {
        await ToolsManualSyncDaoTransactions.fixOldTransactions(txLog, daoDb)
        return await DaoTransactions.saveTransaction(txLog as any, ITransactionType.withdraw, daoDb)
      },
      onError: async (error: any) => {
        logger.error(
          'Error withdraw transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: daoDb.id, network: daoDb.network }),
        )
      },
      logService: `withdraw-${daoDb.address}-${IEnumIndexerService.withdrawTxs}` as any,
      stopOnError: true,
    })

    await Promise.all([depositTxCrawler.crawl(), withdrawTxCrawler.crawl()])
  },

  fixOldTransactions: async (txLog: IAlchemyTransferResponse, daoDb: any) => {
    const oldTx = await Models.Transaction.findOne({
      transactionHash: txLog.hash,
      network: daoDb.network,
    })

    if (oldTx && !oldTx.uniqueId) {
      await Models.Transaction.deleteOne({
        _id: oldTx._id,
      })
      logger.info('Remove old transaction', llo({ txLog: txLog.hash, dao: daoDb.address }))
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoTransactions
