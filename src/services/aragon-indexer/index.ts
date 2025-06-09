import logger from '@logger'
import { EnumConnection, EnumQueueName, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { SyncAll } from '@indexer/syncAll'

import { CustomInstall } from '@indexer/customInstall'
import config from '@config'
import PoolingCrawler from '@modules/poolingCrawler'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const AragonIndexerService: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  repeaters: {},

  start: async function () {
    const startTime = Date.now()
    logger.info('IndexerService historical started', llo({}))

    const networks = NetworkHelper.supportedNetworks()
    await CustomInstall.install()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const logService: any = `indexer-${networkName}`

        const existingConfig = await Models.ConfigIndexer.findExistingLog({
          network: networkName,
          service: logService!,
        })

        // sync historical data
        if (!existingConfig) {
          logger.info('HistoricalCrawler start', llo({ networkName }))
          const historicalCrawler = new BlockchainLogCrawler({
            onlyHistorical: true,
            network: networkName,
            events: utils.filterArrayByProperty(configIndexer, 'enableHistorical'),
            onError: async (error: any) => logger.error('Error Indexer', llo(error)),
            logService,
            stopOnError: true,
          })
          await historicalCrawler.crawl()
          logger.info('HistoricalCrawler end', llo({ networkName }))
        }

        // sync all metrics by network
        logger.info('Sync all metrics start', llo({ networkName }))
        await RabbitMQHelper.sendMessage(EnumQueueName.allMetrics, {
          id: `${EnumQueueName.allMetrics}-${networkName}`,
          params: { network: networkName },
        })

        // realtime after sync
        logger.info('PoolingCrawler start', llo({ networkName }))

        const taskOptions = {
          fn: () => [[{ poolingCrawler: PoolingCrawler, params: { logService, network: networkName } }]],
          interval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL,
          checkInterval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL / 2,
          runNow: true,
          stopOnError: false,
          onError: (error: any) => logger.error('Error pooling logs', llo({ networkName, error })),
        }

        const scheduler = TaskSchedulerState.getInstance()
        await scheduler.startTask(logService, taskOptions)
      }),
    )

    // re-sync all installed plugins
    if (config.SERVICES.ARAGON_INDEXER.SYNC_ALL) {
      logger.info('Sync all plugins start', llo({}))

      const taskOptions = {
        fn: () => [[{ syncAllPlugins: SyncAll }]],
        interval: 5 * 1000,
        runNow: true,
        stopOnError: false,
        onError: (error: any) => logger.error('Error sync all plugins', llo({ error })),
      }
      const scheduler = TaskSchedulerState.getInstance()
      await scheduler.startTask('allPlugins', taskOptions)

      logger.info(
        'Pooling Scheduler started',
        llo({
          duration: Date.now() - startTime,
        }),
      )
    }
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('allPlugins')

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default AragonIndexerService
