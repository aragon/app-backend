import { Models } from '@dbModels'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import DBCrawler from '@models/utils/crawler'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: DaoMetrics' })

export const RefetchDaoMetrics: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const crawler = new DBCrawler({
      model: Models.Dao,
      onDocument: async (dao: Dao) => DaoMetrics.onDocument(dao),
      onError: (error: any, document: any) => {
        logger.error('Error Dao Metrics', { document, error })
      },
      where: {
        // address: '0xB2EcFF866C75c640F335AFbE5b09D5B03d464362',
        // pluginAddress: '0x0673c13D48023efA609C20E5E351763B99Dd67DE',
        // proposalIndex: '1',
      },
      batchSize: 2000,
      concurrency: 100,
    })

    await crawler.crawl()

    logger.info('End Dao Metrics', llo())
  },

  stop: async () => {},
}

export default RefetchDaoMetrics
