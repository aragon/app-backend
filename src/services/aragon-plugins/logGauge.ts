import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { GaugeLogs, type IIndexerConfig } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogGauge' })

export const LogGauge = {
  start: async (plugin: Plugin, isHistorical?: boolean) => {
    logger.verbose('Start LogGauge', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configGaugeLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(GaugeLogs).includes(item.event as any),
    )

    const crawlerGaugeToken = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: configGaugeLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogGauge.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })

    await crawlerGaugeToken.crawl()
    await crawlerGaugeToken.end()

    logger.verbose(
      'End LogGauge',
      llo({ network: plugin.network, latestBlockSync: crawlerGaugeToken.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogGauge',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
