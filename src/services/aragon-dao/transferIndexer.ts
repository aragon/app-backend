import logger from '@logger'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ConfigIndexerHelper from '@helpers/configIndexer'
import config from '@config'
import PoolingCrawler from '@modules/poolingCrawler'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:TransferIndexer' })

export const TransferIndexer = {
  start: async () => {
    logger.info('TransferIndexer started', llo({}))

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const logService = ConfigIndexerHelper.builders.indexer(networkName)

        logger.info('TransferIndexer pooling start', llo({ networkName }))

        const taskOptions = {
          fn: () => [
            [{ poolingCrawler: PoolingCrawler, params: { logService, network: networkName, includeTransfer: true } }],
          ],
          interval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL,
          checkInterval: config.NODES[utils.networkToAragon(networkName)].POOLING_INTERVAL / 2,
          runNow: true,
          stopOnError: false,
          onError: (error: any) => logger.error('Error pooling transfer logs', llo({ networkName, error })),
        }

        const scheduler = TaskSchedulerState.getInstance()
        await scheduler.startTask(logService, taskOptions)
      }),
    )

    logger.info('TransferIndexer all tasks started', llo({}))
  },

  stop: async () => {
    logger.info('TransferIndexer stopped', llo({}))
  },
}
