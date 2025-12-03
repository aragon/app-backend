import logger from '@logger'
import { IPolicyLogs, type IIndexerConfig, type NetworksEnum } from '@types'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import ConfigIndexerHelper from '@helpers/configIndexer'
import ProxyWeb3Provider from '@modules/proxyProvider'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogPolicy' })

export const LogPolicy = {
  /**
   * Start crawling policy events for a source or model contract
   * @param address - The source or model contract address
   * @param network - The network
   */
  start: async (address: string, network: NetworksEnum) => {
    logger.verbose('Start LogPolicy for contract', llo({ network, address }))

    const configPolicyLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IPolicyLogs).includes(item.event as any),
    )

    // Since source/model contracts can be deployed at different blocks, we need to fetch the creation block
    const contractCreationInfo = await ProxyWeb3Provider.fetchContractCreation({ address, network })
    if (!contractCreationInfo.blockNumber) {
      logger.warn('Cannot find contract creation block number', llo({ network, address }))
      return
    }

    const crawlerPolicy = new BlockchainLogCrawler({
      onlyHistorical: true,
      network,
      events: configPolicyLogs,
      address,
      fromBlock: contractCreationInfo.blockNumber,
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
