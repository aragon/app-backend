import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig, ITokenVotingLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  start: async (plugin: Plugin) => {
    logger.verbose('Start LogTokenVoting', llo({ network: plugin.network, pluginAddress: plugin.address }))
    const { default: configIndexer } = await import('@indexer/configIndexer')

    const configTVLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ITokenVotingLogs).includes(item.event as any),
    )
    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configTVLogs, ...configGovLogs],
      address: [plugin.address, plugin.tokenAddress],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any) => LogTokenVoting.processError(error, plugin),
      logService: `TokenVoting-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })
    await crawler.crawl()

    logger.verbose(
      'End LogTokenVoting',
      llo({ network: plugin.network, latestBlockSync: crawler.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin) => {
    logger.error(
      'Error LogTokenVoting',
      llo({
        error,
        plugin,
      }),
    )
  },
}
