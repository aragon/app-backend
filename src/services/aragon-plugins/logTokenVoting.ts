import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig, ITokenVotingLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  start: async (plugin: Plugin, token: Token) => {
    logger.verbose('Start LogTokenVoting', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configTVLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ITokenVotingLogs).includes(item.event as any),
    )
    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configTVLogs],
      address: [plugin.address],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any) => LogTokenVoting.processError(error, plugin),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })

    const crawlerToken = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configGovLogs],
      address: [plugin.tokenAddress],
      fromBlock: token?.blockNumber,
      onError: async (error: any) => LogTokenVoting.processError(error, plugin),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}`,
      stopOnError: true,
    })

    await Promise.all([
      // crawler.crawl(),
      crawlerToken.crawl(),
    ])

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
