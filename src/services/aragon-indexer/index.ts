import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import EventListener from '@modules/eventListener'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService historical started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    // only first time to index from scratch then sync all events, it may be slow but is necessary
    await Promise.all(
      networks.map(async ({ networkName }) => {
        const logService = `Indexer-${networkName}`
        const existingConfig = await Models.ConfigIndexer.findExistingLog({
          network: networkName,
          service: logService,
        })

        const configLogs = existingConfig
          ? configIndexer
          : utils.filterArrayByProperty(configIndexer, 'enableHistorical')

        const crawler = new BlockchainLogCrawler({
          onlyHistorical: !existingConfig,
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

    // latest block
    await Promise.all(
      networks.map(async ({ networkName }) => {
        const eventListener = new EventListener(networkName, configIndexer)
        eventListener.subscribeEventsByNewBlock()
      }),
    )
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default IndexerService
