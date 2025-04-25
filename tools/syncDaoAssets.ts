import { EnumConnection, type IService } from '@types'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import DBCrawler from '@models/utils/crawler'
import type Dao from '@models/schema/dao'
import logger from '@logger'

export const SyncDaoAssets: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const crawler = new DBCrawler({
      model: Models.Dao,
      onDocument: async (dao: Dao) => {
        await DaoAssets.start({ daoAddress: dao.address, network: dao.network })
        await DaoTransactions.start({ daoAddress: dao.address, network: dao.network })
      },
      onError: (error: any, document: any) => {
        logger.error('Error Dao Metrics', { document, error })
      },
      where: {},
      batchSize: 2000,
      concurrency: 10,
    })

    await crawler.crawl()
  },

  stop: async () => {},
}

export default SyncDaoAssets
