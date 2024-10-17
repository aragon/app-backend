import logger from '@logger'
import { type IIndexerConfig, IMultiSigLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogMultiSig' })

export const LogMultiSig = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogMultiSig', llo({ network: plugin.network, plugin,  }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IMultiSigLogs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any) => LogMultiSig.processError(error, plugin),
      logService: `MultiSig-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose('End LogMultiSig', llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }))
  },

  processError: async (error: any, plugin: Plugin) => {
    logger.error(
      'Error LogMultiSig',
      llo({
        error,
        plugin,
      }),
    )
  },
}
