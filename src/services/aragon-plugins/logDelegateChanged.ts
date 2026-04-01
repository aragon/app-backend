import { Models } from '@dbModels'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { type IIndexerConfig, IVotingEscrowAdapterLogs } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDelegateChanged' })

export const LogDelegateChanged = {
  start: async (plugin: Plugin) => {
    const infoLogs = { network: plugin.network, pluginAddress: plugin.address, tokenAddress: plugin.tokenAddress }
    logger.verbose('Start LogDelegateChanged historical sync', llo(infoLogs))

    const token = await Models.Token.findOne({ address: plugin.tokenAddress, network: plugin.network })
    const fromBlock = token?.blockNumber || plugin.blockNumber

    const delegateChangedConfig = configIndexer.filter(
      (item: IIndexerConfig) => item.event === IVotingEscrowAdapterLogs.DelegateChanged,
    )

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network: plugin.network,
      events: delegateChangedConfig,
      address: [plugin.tokenAddress],
      fromBlock,
      onError: async (error: any, log: any) => LogDelegateChanged.processError(error, plugin, log),
      stopOnError: true,
    })

    await crawler.crawl()
    await crawler.end?.()

    logger.verbose(
      'End LogDelegateChanged historical sync',
      llo({ ...infoLogs, lastSync: crawler.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error('Error LogDelegateChanged', llo({ log, error, plugin }))
  },
}
