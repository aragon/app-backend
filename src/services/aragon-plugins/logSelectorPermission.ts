import logger from '@logger'
import { ISelectorPermissionLogs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import type Plugin from '@models/schema/plugin'
import ProxyWeb3Provider from '@src/modules/proxyProvider'
import ConfigIndexerHelper from '@helpers/configIndexer'

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
      logService: ConfigIndexerHelper.builders.permission(plugin.network, plugin.address),
      stopOnError: true,
    })
    await crawler.crawl()

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
