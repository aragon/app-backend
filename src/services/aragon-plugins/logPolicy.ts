import logger from '@logger'
import { IPolicyLogs, type IIndexerConfig, type NetworksEnum } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPolicy' })

export const LogPolicy = {
  /**
   * Start crawling policy events for a source or model contract
   * @param address - The source or model contract address
   * @param network - The network
   * @param fromBlock - Block to start syncing from (typically the deployment block)
   */
  startForContract: async (address: string, network: NetworksEnum, fromBlock: number) => {
    logger.verbose('Start LogPolicy for contract', llo({ network, address, fromBlock }))

    const configPolicyLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IPolicyLogs).includes(item.event as any),
    )

    const crawlerPolicy = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: configPolicyLogs,
      address,
      fromBlock,
      onError: async (error: any, log: any) => LogPolicy.processError(error, address, network, log),
      logService: ConfigIndexerHelper.builders.policyContract(network, address),
      stopOnError: true,
    })

    await crawlerPolicy.crawl()
    await crawlerPolicy.end()

    logger.verbose(
      'End LogPolicy for contract',
      llo({ network, address, latestBlockSync: crawlerPolicy.crawlSetting.lastSync }),
    )
  },

  /**
   * Start crawling policy events for a plugin
   * @param plugin - The plugin document
   * @param isHistorical - Whether to run in historical mode
   */
  start: async (plugin: Plugin, isHistorical?: boolean) => {
    logger.verbose('Start LogPolicy', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configPolicyLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IPolicyLogs).includes(item.event as any),
    )

    const crawlerPolicy = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: configPolicyLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogPolicy.processError(error, plugin.address, plugin.network, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })

    await crawlerPolicy.crawl()
    await crawlerPolicy.end()

    logger.verbose(
      'End LogPolicy',
      llo({ network: plugin.network, latestBlockSync: crawlerPolicy.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, address: string, network: string, log: any) => {
    logger.error(
      'Error LogPolicy',
      llo({
        log,
        error,
        address,
        network,
      }),
    )
  },
}
