import logger from '@logger'
import { type IIndexerConfig, ILockManager, ILogToVoteLogs } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogLockToVote' })

export const LogLockToVote = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogLockToVote', llo({ network: plugin.network, pluginId: plugin.id }))

    const pluginLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ILogToVoteLogs).includes(item.event as any),
    )

    const lockManagerLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ILockManager).includes(item.event as any),
    )

    const pluginCrawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: pluginLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogLockToVote.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })

    const lockManagerCrawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: lockManagerLogs,
      address: plugin.lockManagerAddress,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogLockToVote.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.lockManager(plugin.network, plugin.lockManagerAddress!),
      stopOnError: true,
    })

    await Promise.all([pluginCrawler.crawl(), lockManagerCrawler.crawl()])
    await Promise.all([pluginCrawler.end(), lockManagerCrawler.end()])

    logger.verbose(
      'End LogLockToVote',
      llo({ network: plugin.network, latestBlockSync: pluginCrawler.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogLockToVote',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
