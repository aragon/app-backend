import logger from '@logger'
import { type IEnumIndexerServiceStatic, type IIndexerConfig, ISPPLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogSpp' })

export const LogSpp = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogSpp', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ISPPLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogSpp.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}` as IEnumIndexerServiceStatic,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose('End LogSpp', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogSpp',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
