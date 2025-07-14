import logger from '@logger'
import { type IIndexerConfig, LockErc721Token } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogGauge' })

export const LogGauge = {
  start: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    logger.verbose(
      'Start LogGauge',
      llo({ network: plugin.network, pluginAddress: plugin.address, tokenAddress: token.address }),
    )

    const configLockTokenLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(LockErc721Token).includes(item.event as any),
    )

    const crawlerGaugeToken = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configLockTokenLogs],
      address: [token.address],
      fromBlock: token?.blockNumber,
      onError: async (error: any, log: any) => LogGauge.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
    })

    await crawlerGaugeToken.crawl()

    logger.verbose(
      'End LogGauge',
      llo({ network: plugin.network, latestBlockSync: crawlerGaugeToken.crawlSetting.lastSync }),
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
