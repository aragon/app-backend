import { Models } from '@dbModels'
import logger from '@logger'
import {
  EnumConnection,
  type IAlchemyTransferResponse,
  IEnumIndexerService,
  ITransactionType,
  NetworksEnum,
} from '@src/types'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import Web3Helper from '@helpers/web3'
import TokenUtils from '@helpers/tokenUtils'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
const llo = logger.logMeta.bind(null, { service: 'Tools: FixBrokenTx' })

export const ToolsFixBrokenTx = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Start fixBrokenTx', llo())
    const daos = await Models.Transaction.aggregate([
      {
        $match: {
          type: 'withdraw',
          network: {
            $in: [
              NetworksEnum.ethereumMainnet,
              NetworksEnum.ethereumSepolia,
              NetworksEnum.polygonMainnet,
              NetworksEnum.baseMainnet,
              NetworksEnum.arbitrumMainnet,
              NetworksEnum.zksyncMainnet,
              NetworksEnum.zksyncSepolia,
              NetworksEnum.optimismMainnet,
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            network: '$network',
            daoAddress: '$daoAddress',
          },
        },
      },
      {
        $project: {
          network: '$_id.network',
          daoAddress: '$_id.daoAddress',
        },
      },
    ])

    for (const dao of daos) {
      const { daoAddress, network } = dao
      logger.info(`Fixing transactions for DAO: ${daoAddress}`, llo({ daoAddress }))
      const dbConfigIndexer = await Models.ConfigIndexer.findOne({
        service: `withdraw-${daoAddress}-${IEnumIndexerService.withdrawTxs}`,
        network,
      })

      if (dbConfigIndexer) {
        await Models.ConfigIndexer.deleteOne({
          _id: dbConfigIndexer._id,
        })
      }

      const totalWithdrawTx = await Models.Transaction.find({
        daoAddress,
        network,
        type: ITransactionType.withdraw,
      })

      logger.info(
        'Cleaning up existing withdraw transactions',
        llo({ daoAddress, totalWithdrawTx: totalWithdrawTx.length }),
      )

      await Models.Transaction.deleteMany({
        daoAddress,
        network,
        type: ITransactionType.withdraw,
      })

      const category = TokenUtils.getCategories(network)
      const txLogs: any[] = []

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)

      const withdrawTxCrawler = new BlockchainTransferCrawler({
        network,
        filter: {
          fromAddress: daoAddress,
          fromBlock: daoDb.blockNumber,
          category,
        },
        onTx: async (txLog: IAlchemyTransferResponse) => {
          const timestamp = await Web3Helper.getBlockTimestamp(txLog.blockNum, network)
          txLogs.push({
            ...txLog,
            type: ITransactionType.withdraw,
            blockTimestamp: timestamp,
            address: daoAddress,
            network,
          })
        },
        onError: async (error: any) => {
          logger.error('Error withdraw transfer', llo({ error, type: ITransactionType.withdraw, daoAddress, network }))
        },
        logService: `withdraw-${daoAddress}-${IEnumIndexerService.withdrawTxs}` as any,
        stopOnError: true,
      })

      await withdrawTxCrawler.crawl()

      logger.info('Total transactions found for DAO:', llo({ daoAddress, count: txLogs.length }))

      const sortedLogs = txLogs.sort((a, b) => {
        if (a.blockNum !== b.blockNum) return a.blockNum - b.blockNum
        return a.blockNum - b.blockNum
      })

      await Promise.all(
        sortedLogs.map(async (tx: any) => {
          await DaoTransactions.saveTransaction(tx, tx.type, daoDb.address, daoDb.network)
        }),
      )

      logger.info(`Finished fixing transactions for DAO: ${daoAddress}`, llo({ daoAddress }))
    }
  },

  stop: async () => {
    logger.info('End fixBrokenTx', llo())
  },
}
