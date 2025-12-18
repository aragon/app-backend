import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { IDaoLogs, type IIndexerConfig } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDao' })

export const LogDao = {
  start: async (dao: Dao) => {
    logger.verbose('Start LogDao', llo({ network: dao.network }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IDaoLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: dao.network,
      events: configLogs,
      address: dao.address,
      fromBlock: dao?.blockNumber || 0,
      onError: async (error: any, log: any) => LogDao.processError(error, dao, log),
      logService: ConfigIndexerHelper.builders.dao(dao.network, dao.address),
      stopOnError: true,
    })
    await crawler.crawl()
    await crawler.end()

    logger.verbose('End LogDao', llo({ network: dao.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, dao: Dao, log: any) => {
    logger.error(
      'Error LogDao',
      llo({
        log,
        error,
        dao,
      }),
    )
  },
}
