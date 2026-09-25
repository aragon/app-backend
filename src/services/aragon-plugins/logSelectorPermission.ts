import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProxyWeb3Provider from '@src/modules/proxyProvider'
import { type IIndexerConfig, IPluginInterfaceType, ISelectorPermissionLogs } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogSelectorPermission' })

export const LogSelectorPermission = {
  start: async (plugin: Plugin) => {
    logger.verbose(
      'Start LogSelectorPermission',
      llo({ network: plugin.network, address: plugin.address, conditionAddress: plugin.conditionAddress }),
    )

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ISelectorPermissionLogs).includes(item.event as any),
    )

    const deploymentInfo = await ProxyWeb3Provider.fetchContractCreation({
      address: plugin.conditionAddress!,
      network: plugin.network,
    })

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: configLogs,
      address: plugin.conditionAddress,
      fromBlock: deploymentInfo.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => LogSelectorPermission.processError(error, plugin, log),
      // A Safe has a row per DAO and a new condition on every regrant, so its progress is kept per DAO
      // and condition or a crawl would resume from another one's block.
      logService: ConfigIndexerHelper.builders.permission(
        plugin.network,
        plugin.interfaceType === IPluginInterfaceType.safe
          ? `${plugin.address}-${plugin.daoAddress}-${plugin.conditionAddress}`
          : plugin.address,
      ),
      stopOnError: true,
    })
    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End SelectorPermission',
      llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error SelectorPermission',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
