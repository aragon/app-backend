import logger from '@logger'
import { IGaugeVoterLogs, type IIndexerConfig, LockErc721Token } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogGauge' })

export const LogGauge = {
  start: async (plugin: Plugin, token: Token) => {
    logger.verbose('Start LogGauge', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configGaugeVoterLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGaugeVoterLogs).includes(item.event as any),
    )

    const configLockTokenLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(LockErc721Token).includes(item.event as any),
    )

    const crawlerGaugeVoter = new BlockchainLogCrawler({
      network: plugin.network,
      events: configGaugeVoterLogs,
      address: plugin.address,
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogGauge.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })

    const crawlerToken = new BlockchainLogCrawler({
      network: plugin.network,
      events: [...configLockTokenLogs],
      address: [plugin.tokenAddress],
      fromBlock: token?.blockNumber,
      onError: async (error: any, log: any) => LogGauge.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}`,
      stopOnError: true,
    })

    await Promise.all([crawlerGaugeVoter.crawl(), crawlerToken.crawl()])

    logger.verbose(
      'End LogGauge',
      llo({ network: plugin.network, latestBlockSync: crawlerGaugeVoter.crawlSetting.lastSync }),
    )
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogGauge',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
