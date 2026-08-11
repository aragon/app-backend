import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { BlockchainLogCrawler } from '@modules/crawlers'
import {
  type HexAddress,
  IEventLogCrossChainSettings,
  type IIndexerConfig,
  IPluginInterfaceType,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogCrossChain' })

export const LogCrossChain = {
  start: async (plugin: Plugin) => {
    const pluginAddress = plugin.address
    const network = plugin.network

    logger.verbose('Start LogCrossChain for plugin', llo({ network, pluginAddress }))

    const crossChainLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IEventLogCrossChainSettings).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: crossChainLogs,
      address: pluginAddress,
      fromBlock: plugin.blockNumber,
      onError: async (error: any, log: any) => LogCrossChain._processError(error, pluginAddress, network, log),
      logService: ConfigIndexerHelper.builders.plugin(
        IPluginInterfaceType.crossChainController,
        network,
        pluginAddress,
      ),
      stopOnError: true,
    })

    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End LogCrossChain for plugin',
      llo({ network, pluginAddress, lastSync: crawler.crawlSetting.lastSync }),
    )
  },

  _processError: async (error: any, address: HexAddress, network: NetworksEnum, log: any) => {
    logger.error('Error LogCrossChain', llo({ log, error, address, network }))
  },
}
