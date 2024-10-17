import logger from '@logger'
import { IAdminLogs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogAdmin' })

export const LogAdmin = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogAdmin', llo({ network: plugin.network }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IAdminLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: [plugin.address, plugin.daoAddress],
      fromBlock: plugin?.blockNumber || 0,
      onError: async (error: any) => LogAdmin.processError(error, plugin),
      logService: `Admin-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose('End LogAdmin', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin) => {
    logger.error(
      'Error LogAdmin',
      llo({
        error,
        plugin,
      }),
    )
  },
}
