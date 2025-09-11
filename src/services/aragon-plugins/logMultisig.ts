import logger from '@logger'
import { type IIndexerConfig, IMultiSigLogs } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMultiSig' })

export const LogMultiSig = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogMultiSig', llo({ network: plugin.network, pluginId: plugin.id }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IMultiSigLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogMultiSig.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })
    await crawler.crawl()
    await crawler.end()

    logger.verbose('End LogMultiSig', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogMultiSig',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
