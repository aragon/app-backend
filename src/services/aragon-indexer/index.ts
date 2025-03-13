import logger from '@logger'
import { EnumConnection, EnumQueueName, type IEnumIndexerServiceStatic, type IService, NetworksEnum } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { SyncAll } from '@indexer/syncAll'

import { CustomInstall } from '@indexer/customInstall'
import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import EventListenerV2 from '@modules/eventListenerV2'
import EventListener from '@modules/eventListener'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const AragonIndexerService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  repeaters: {},

  start: async function () {
    logger.info('IndexerService historical started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    await CustomInstall.install()

    logger.info('CustomInstall end', llo({}))

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const configLogs = utils.filterArrayByProperty(configIndexer, 'enableHistorical')

        const crawler = new BlockchainLogCrawler({
          onlyHistorical: true,
          network: networkName,
          events: configLogs,
          onError: async (error: any) => logger.error('Error Indexer', llo(error)),
          logService: `indexer-${networkName}` as IEnumIndexerServiceStatic,
          stopOnError: true,
        })

        await crawler.crawl()

        if (networkName === NetworksEnum.peaqMainnet) {
          const eventListener = new EventListener(networkName, configIndexer)
          eventListener.subscribeEventsByNewBlock()
        } else {
          const interval = config.NODES[utils.networkToAragon(networkName)].INTERVAL_BLOCK_TIME * 1000

          // realtime after sync
          const eventListener = new EventListenerV2(networkName, configIndexer, {
            processingTimeoutMs: config.REALTIME.PROCESSING_TIMEOUT_MS,
            maxFailures: config.REALTIME.MAX_FAILURES,
            circuitBreakerPauseMs: config.REALTIME.CIRCUIT_BREAKER_PAUSE_MS,
            batchWindowMs: interval,
          })

          eventListener.subscribeEventsByNewBlock()
        }

        // resync all metrics by network
        await RabbitMQHelper.sendMessage(EnumQueueName.allMetrics, {
          id: `${EnumQueueName.allMetrics}-${networkName}`,
          params: { network: networkName },
        })
      }),
    )

    logger.info('IndexerService historical logs end', llo({}))

    // re-sync all installed plugins
    const taskOptions = {
      fn: () => [[{ syncAllPlugins: SyncAll }]],
      interval: config.SERVICES.ARAGON_INDEXER.PLUGIN_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => logger.error('Error sync all plugins', llo({ error })),
    }

    if (config.SERVICES.ARAGON_INDEXER.SYNC_ALL) {
      const scheduler = TaskSchedulerState.getInstance()
      await scheduler.startTask('allPlugins', taskOptions)
    }
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('allPlugins')

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default AragonIndexerService
