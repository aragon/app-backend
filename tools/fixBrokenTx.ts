import { Models } from '@dbModels'
import logger from '@logger'
import { EnumConnection, IEnumIndexerService, NetworksEnum } from '@src/types'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import DBCrawler from '@models/utils/crawler'
const llo = logger.logMeta.bind(null, { service: 'Tools: FixBrokenTx' })

export const ToolsFixBrokenTx = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Start fixBrokenTx', llo())
    const networks = [
      NetworksEnum.ethereumMainnet,
      NetworksEnum.ethereumSepolia,
      NetworksEnum.polygonMainnet,
      NetworksEnum.baseMainnet,
      NetworksEnum.arbitrumMainnet,
      NetworksEnum.zksyncMainnet,
      NetworksEnum.zksyncSepolia,
      NetworksEnum.optimismMainnet,
    ]

    for (const network of networks) {
      logger.info('Start fixBrokenTx for network', llo({ network }))

      const dbCrawler = new DBCrawler({
        model: Models.Dao,
        where: {
          network,
          isActive: true,
        },
        onError: (error: any, document: any) => {
          logger.error('Error Dao Fix', { document, error })
        },
        batchSize: 100,
        concurrency: 10,
        onDocument: async (dao: any) => {
          await ToolsFixBrokenTx.onDocument(dao)
        },
      })

      await dbCrawler.crawl()

      logger.info('End fixBrokenTx for network', llo({ network }))
    }
  },
  onDocument: async (dao: any) => {
    const daoAddress = dao.address
    const network = dao.network as NetworksEnum

    logger.info('Fixing transactions for DAO', llo({ daoAddress, network }))
    const hasAssets = await Models.Asset.countDocuments({ daoAddress, network })

    if (!hasAssets) {
      logger.warn('No assets found for DAO, skipping', llo({ daoAddress, network }))
      return
    }

    await Models.ConfigIndexer.deleteOne({
      service: `withdraw-${daoAddress}-${IEnumIndexerService.withdrawTxs}`,
      network,
    })

    await Models.ConfigIndexer.deleteOne({
      service: `deposit-${daoAddress}-${IEnumIndexerService.depositTxs}`,
      network,
    })

    const daoTxs = await Models.Transaction.find({
      daoAddress,
      network,
    })

    logger.info('Cleaning up existing transactions', llo({ daoAddress, totalTxns: daoTxs.length, network }))

    await Models.Transaction.deleteMany({
      daoAddress,
      network,
    })

    await DaoTransactions.start({
      daoAddress,
      network,
    })

    logger.info('Finished fixing transactions for DAO', llo({ daoAddress, network }))
  },

  stop: async () => {
    logger.info('End fixBrokenTx', llo())
  },
}
