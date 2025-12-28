import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { ICapitalDistributorLogs, type IIndexerConfig } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogCapitalDistributor' })

export const LogCapitalDistributor = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogCapitalDistributor', llo({ network: plugin.network, pluginId: plugin.id }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ICapitalDistributorLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogCapitalDistributor.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })
    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End LogCapitalDistributor',
      llo({
        network: plugin.network,
        latestBlockSync: crawler.crawlSetting.lastSync,
      }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogCapitalDistributor',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
