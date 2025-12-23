import ConfigIndexerHelper from '@helpers/configIndexer'
import configIndexer from '@indexer/configIndexer'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { type HexAddress, ICapitalDistributorStrategyEvents, type IIndexerConfig, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogCampaignStrategy' })

export const LogCampaignStrategy = {
  start: async (allocationStrategyAddress: HexAddress, network: NetworksEnum, fromBlock?: number) => {
    logger.verbose('Start LogCampaignStrategy', llo({ network, allocationStrategyAddress, fromBlock }))

    const configLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ICapitalDistributorStrategyEvents).includes(item.event as any),
    )

    const crawler = new BlockchainLogCrawler({
      network: network as any,
      events: configLogs,
      address: allocationStrategyAddress,
      fromBlock,
      onError: async (error: any, log: any) => LogCampaignStrategy.processError(error, log),
      logService: ConfigIndexerHelper.builders.campaignAllocationStrategy(network, allocationStrategyAddress),
      stopOnError: true,
    })
    await crawler.crawl()
    await crawler.end()

    logger.verbose(
      'End LogCampaignStrategy',
      llo({
        network,
        allocationStrategyAddress,
        latestBlockSync: crawler.crawlSetting.lastSync,
      }),
    )
  },

  processError: async (error: any, log: any) => {
    logger.error(
      'Error LogCampaignStrategy',
      llo({
        log,
        error,
      }),
    )
  },
}
