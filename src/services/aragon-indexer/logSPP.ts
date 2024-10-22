import logger from '@logger'
import { type IIndexerConfig, ISPPLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogSpp' })

export const LogSpp = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogSpp', llo({ network: plugin.network, pluginAddress: plugin.address }))
    const { default: configIndexer } = await import('@indexer/configIndexer')
    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ISPPLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any) => LogSpp.processError(error, plugin),
      logService: `SPP-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose('End LogSpp', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin) => {
    logger.error(
      'Error LogSpp',
      llo({
        error,
        plugin,
      }),
    )
  },
}
