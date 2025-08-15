import logger from '@logger'
import { type IIndexerConfig, ICapitalDistributorLogs, type NetworksEnum, type HexAddress } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogCampaignStrategy' })

export const LogCampaignStrategy = {
  start: async (allocationStrategyAddress: HexAddress, network: NetworksEnum, fromBlock?: number) => {
    logger.verbose('Start LogCampaignStrategy', llo({ network, allocationStrategyAddress, fromBlock }))

    const configLogs = configIndexer.filter(
      (item: IIndexerConfig) => ICapitalDistributorLogs.MerkleCampaignSet === item.event,
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
