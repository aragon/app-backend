import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogToken' })

export const LogToken = {
  start: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    logger.verbose('Start Log Token', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const crawlerToken = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configGovLogs],
      address: [plugin.tokenAddress],
      fromBlock: token?.blockNumber,
      onError: async (error: any, log: any) => LogToken.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}`,
      stopOnError: true,
    })

    await crawlerToken.crawl()

    logger.verbose(
      'End LogToken',
      llo({ network: plugin.network, latestBlockSync: crawlerToken.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogToken',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
