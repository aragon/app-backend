import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          events: configLogs,
          onError: async (error: any) => logger.error('Error Indexer', llo(error)),
          logService: `Indexer-${networkName}`,
          stopOnError: true,
        })
        await crawler.crawl()
      }),
    )

    logger.info('IndexerService historical logs end', llo({}))
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default IndexerService
